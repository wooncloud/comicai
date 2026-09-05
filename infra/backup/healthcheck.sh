#!/bin/sh
# 마지막 성공 백업이 낡았으면 컨테이너를 unhealthy 로 만든다.
#
# cron 은 조용히 실패한다. 그리고 `restart: unless-stopped` 인 백업 컨테이너가 살아
# 있다는 것과 백업이 실제로 돌았다는 것은 전혀 다른 얘기인데, `docker ps` 만 보면
# 둘이 똑같아 보인다 — 이 프로젝트에서 백업 실패를 알아채는 경로가 그것뿐이었다.
#
# `backup.sh` 는 gzip 무결성과 pg_dump 완료 표식까지 통과한 회차에서만 `last-success`
# 를 남긴다. 그래서 이 파일의 나이가 곧 "마지막으로 복구 가능한 백업이 언제였나" 다.
set -eu
: "${BACKUP_DIR:=/backup}"
# 일 1회 스케줄 + 여유 2시간. BACKUP_SCHEDULE 을 성기게 바꾸면 이것도 같이 올려야 한다.
: "${BACKUP_STALE_HOURS:=26}"

f="${BACKUP_DIR}/last-success"
[ -f "${f}" ] || { echo "성공한 백업 기록이 없다"; exit 1; }

age=$(( $(date -u +%s) - $(cat "${f}") ))
if [ "${age}" -gt $(( BACKUP_STALE_HOURS * 3600 )) ]; then
  echo "마지막 성공 백업이 $(( age / 3600 ))시간 전 (한도 ${BACKUP_STALE_HOURS}시간)"
  exit 1
fi
echo "마지막 성공 백업 $(( age / 60 ))분 전"
