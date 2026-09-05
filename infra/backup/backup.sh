#!/bin/sh
# Postgres pg_dump + MinIO 오브젝트 백업.
#
# ## 이 스크립트가 지키는 것
#
# **삭제는 백업으로 전파되지 않는다.** 예전에는 `mc mirror --overwrite --remove` 였다.
# 소스에서 사라진 오브젝트를 백업에서도 지운다는 뜻이고, 그러면 실수로 지운 그날 밤
# 백업이 증거를 마저 없앤다 — 백업이 막아야 할 사고가 정확히 그 사고인데. 지금은
# 사라진 파일을 `minio-trash/<시각>/` 으로 옮기고 보존 기간이 지난 뒤에만 지운다.
#
# **끝까지 못 쓴 덤프는 남기지 않는다.** 예전에는 `pg_dump | gzip > out.sql.gz` 였다.
# pg_dump 가 중간에 죽거나 디스크가 차면 `out.sql.gz` 가 **열리기는 하는 gzip** 으로
# 남는다. 파일이 있고 크기도 0 이 아니라서, 복구하려고 풀어 보기 전까지 아무도 모른다.
# 지금은 `.part` 에 쓰고 gzip 무결성과 pg_dump 종료 표식까지 확인한 뒤에야 제자리로
# 옮긴다.
#
# **실패를 알린다.** cron 은 조용히 실패한다. 성공한 회차만 `last-success` 에 시각을
# 남기고, 컨테이너 healthcheck 가 그게 낡으면 unhealthy 로 바꾼다(`healthcheck.sh`).
# `BACKUP_WEBHOOK_URL` 이 있으면 실패를 그쪽으로도 던진다.
#
# **오래된 것을 지우는 일은 성공한 뒤에만 한다.** 덤프가 20일 연속 실패하는 동안
# 보존 정리만 돌면 마지막 성공본까지 지운다. 실패는 위에서 `exit 1` 로 끊긴다.
#
# ## 아직 남은 것 (운영자 몫)
#
# 백업이 원본과 **같은 디스크** 에 있다. 디스크가 죽으면 DB·오브젝트·백업이 함께
# 죽는다. `BACKUP_REMOTE_*` 를 채우면 매 회차 끝에 외부 S3 로 밀어낸다 — 목적지는
# 사람이 정해야 해서 기본값을 둘 수 없다.
#
# `.env` 는 일부러 백업하지 않는다. 여기 담긴 값이 그대로 외부 저장소로 나가면 그
# 저장소 하나가 뚫리는 순간 전부가 뚫린다. `MASTER_KEY`·`SESSION_SECRET` 은 사람이
# 비밀번호 관리자에 넣어 둘 것. (`MASTER_KEY` 를 잃으면 사용자가 저장해 둔 BYOK 키만
# 못 읽는다 — `apps/api/src/api-keys/crypto.ts`. 재입력하면 되고 그 외 데이터는 무관.)
#
# ## 환경변수
#   POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
#   S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET
#   BACKUP_DIR (기본 /backup)
#   BACKUP_RETENTION_DAYS (기본 14)
#   BACKUP_WEBHOOK_URL (선택) — 실패 시 JSON POST
#   BACKUP_REMOTE_ENDPOINT / _ACCESS_KEY / _SECRET_KEY / _BUCKET / _PREFIX (선택) — 원격 사본
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:=comicai}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:=comicai}"
: "${S3_ENDPOINT:=http://minio:9000}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
: "${S3_BUCKET:=comicai}"
: "${BACKUP_DIR:=/backup}"
: "${BACKUP_RETENTION_DAYS:=14}"

ts=$(date -u +"%Y%m%dT%H%M%SZ")
mirror_dir="${BACKUP_DIR}/minio/${S3_BUCKET}"
trash_dir="${BACKUP_DIR}/minio-trash"
work=$(mktemp -d)

log() { echo "[backup ${ts}] $*"; }

# 실패를 밖으로 내보낸다. 웹훅이 없으면 로그만 남는다 — healthcheck 가 last-success 로
# 따로 잡아 주므로 웹훅은 있으면 좋은 것이지 유일한 통로가 아니다.
notified=0
notify_failure() {
  notified=1
  log "FAILED: $1" >&2
  [ -n "${BACKUP_WEBHOOK_URL:-}" ] || return 0
  # 본문에 값이 그대로 들어가지 않도록 문구는 이 스크립트가 만든 것만 쓴다.
  curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"[comicai backup ${ts}] 실패: $1\"}" \
    "${BACKUP_WEBHOOK_URL}" >/dev/null 2>&1 \
    || log "웹훅 전송 실패 (백업 실패는 그대로 유효)" >&2
}

fail() {
  notify_failure "$1"
  exit 1
}

# 중간에 어디서 죽든 임시 파일은 치우고, 성공 표식을 못 남겼으면 실패로 알린다.
done_ok=0
cleanup() {
  st=$?
  rm -rf "${work}"
  # fail() 로 온 경우는 이미 알렸다. 그 외 경로로 죽었으면(set -e) 여기서 알린다.
  if [ "${done_ok}" != "1" ] && [ "${notified}" != "1" ]; then
    notify_failure "예상치 못한 종료 (exit ${st})"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------- Postgres

mkdir -p "${BACKUP_DIR}/postgres"
pg_out="${BACKUP_DIR}/postgres/${POSTGRES_DB}-${ts}.sql.gz"
pg_part="${pg_out}.part"

log "pg_dump → ${pg_out}"
# 파이프 앞쪽(pg_dump)의 실패는 파이프라인 종료 코드에 안 잡힌다 — gzip 이 0 을 내면
# 끝이다. BusyBox ash 의 `set -o pipefail` 에 기대는 대신 실패 코드를 파일로 흘린다.
rc_file="${work}/pg.rc"
{
  PGPASSWORD="${POSTGRES_PASSWORD}" \
    pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
      --format=plain --no-owner --no-acl \
    || echo "$?" > "${rc_file}"
} | gzip -9 > "${pg_part}" || fail "gzip 실패 (디스크 여유 확인)"

if [ -s "${rc_file}" ]; then
  rm -f "${pg_part}"
  fail "pg_dump 종료 코드 $(cat "${rc_file}")"
fi

gzip -t "${pg_part}" 2>/dev/null || { rm -f "${pg_part}"; fail "덤프 gzip 이 깨졌다"; }

# pg_dump 는 마지막 줄에 완료 표식을 남긴다. 이게 없으면 중간에 끊긴 덤프다 —
# gzip 은 멀쩡한데 내용이 반만 있는 경우가 여기서 걸린다.
gzip -dc "${pg_part}" | tail -c 200 | grep -q 'PostgreSQL database dump complete' \
  || { rm -f "${pg_part}"; fail "덤프가 끝까지 쓰이지 않았다 (완료 표식 없음)"; }

mv "${pg_part}" "${pg_out}"
log "pg_dump ok ($(wc -c < "${pg_out}") B)"

# ---------------------------------------------------------------- MinIO

log "mc mirror → ${mirror_dir}"
mkdir -p "${mirror_dir}" "${trash_dir}"
mc alias set src "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" >/dev/null \
  || fail "mc alias set 실패 (S3 접속 불가)"

# --remove 없음. 의도적이다 — 파일 맨 위 설명 참조.
mc mirror --overwrite "src/${S3_BUCKET}" "${mirror_dir}" || fail "mc mirror 실패"

# 목록을 따로 받는다. 파이프로 바로 sort 에 넘기면 mc 가 실패해도 sort 가 0 을 내서
# "버킷이 비었다" 와 구별이 안 된다 — 그 구별이 아래 안전장치의 전부다.
mc find "src/${S3_BUCKET}" > "${work}/src.raw" || fail "소스 오브젝트 목록을 못 읽었다"
sed "s|^src/${S3_BUCKET}/||" "${work}/src.raw" | sort > "${work}/src.txt"
(cd "${mirror_dir}" && find . -type f | sed 's|^\./||') | sort > "${work}/dst.txt"

src_n=$(wc -l < "${work}/src.txt")
dst_n=$(wc -l < "${work}/dst.txt")

# 목록이 비었는데 백업에는 파일이 있다 = 버킷이 진짜 비었거나, 목록을 못 읽었거나.
# 둘을 구별할 수 없으므로 아무것도 옮기지 않는다. 여기서 잘못 판단하면 이 스크립트가
# 막으려던 바로 그 일을 스스로 한다.
if [ "${src_n}" = "0" ] && [ "${dst_n}" != "0" ]; then
  log "소스 목록이 비었다 — 격리를 건너뛴다 (백업 ${dst_n}개 그대로 둠)"
else
  comm -13 "${work}/src.txt" "${work}/dst.txt" > "${work}/orphans.txt"
  orphan_n=$(wc -l < "${work}/orphans.txt")
  if [ "${orphan_n}" != "0" ]; then
    log "소스에서 사라진 ${orphan_n}개 → minio-trash/${ts}/"
    while IFS= read -r key; do
      [ -n "${key}" ] || continue
      dest="${trash_dir}/${ts}/${key}"
      mkdir -p "$(dirname "${dest}")"
      mv "${mirror_dir}/${key}" "${dest}"
    done < "${work}/orphans.txt"
  fi
fi
log "mirror ok (소스 ${src_n}개)"

# ---------------------------------------------------------------- 원격 사본 (선택)

if [ -n "${BACKUP_REMOTE_ENDPOINT:-}" ]; then
  : "${BACKUP_REMOTE_ACCESS_KEY:?BACKUP_REMOTE_ENDPOINT 를 쓰려면 필요}"
  : "${BACKUP_REMOTE_SECRET_KEY:?BACKUP_REMOTE_ENDPOINT 를 쓰려면 필요}"
  : "${BACKUP_REMOTE_BUCKET:?BACKUP_REMOTE_ENDPOINT 를 쓰려면 필요}"
  remote="dst/${BACKUP_REMOTE_BUCKET}/${BACKUP_REMOTE_PREFIX:-comicai}"
  log "원격 사본 → ${remote}"
  mc alias set dst "${BACKUP_REMOTE_ENDPOINT}" \
    "${BACKUP_REMOTE_ACCESS_KEY}" "${BACKUP_REMOTE_SECRET_KEY}" >/dev/null \
    || fail "원격 mc alias set 실패"
  # 여기도 --remove 없음. 원격은 로컬보다 더 오래 살아야 한다.
  mc mirror --overwrite "${BACKUP_DIR}" "${remote}" || fail "원격 mirror 실패"
fi

# ---------------------------------------------------------------- 보존 정리

# 성공한 회차에서만 여기 온다. 실패가 이어지는 동안 정리가 돌면 마지막 성공본을 지운다.
log "보존 ${BACKUP_RETENTION_DAYS}일 초과분 정리"
find "${BACKUP_DIR}/postgres" -name "*.sql.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find "${trash_dir}" -mindepth 1 -maxdepth 1 -type d -mtime "+${BACKUP_RETENTION_DAYS}" \
  -exec rm -rf {} +

date -u +%s > "${BACKUP_DIR}/last-success"
done_ok=1
log "done"
