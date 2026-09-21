#!/usr/bin/env bash
# 프로덕션 배포: origin/main 을 받아 web/api/worker 를 재빌드·재기동한다.
# .github/workflows/deploy.yml 이 self-hosted 러너에서 하는 일을 손으로 하는 용도.
#
# `pnpm deploy` 는 pnpm 내장 명령이라 가로채인다. 반드시 `pnpm run deploy` 로 실행한다.
#
#   pnpm run deploy              # fast-forward pull → 재기동 (확인 없이 바로 진행)
#   pnpm run deploy --reset      # origin/main 으로 강제 동기화. 커밋 안 된 로컬 변경 삭제
#   pnpm run deploy --yes        # --reset 이 로컬 변경을 지울 때의 확인까지 건너뛴다
#   pnpm run deploy --no-pull    # 코드는 그대로 두고 컨테이너만 재기동
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 프로파일 생성 → env-file 순서 → tunnel/backup 프로파일을 한 곳에 모은 래퍼.
COMPOSE=(env APP_ENV=prod bash scripts/compose.sh)
BRANCH=main
RESET=0
ASSUME_YES=0
PULL=1
# --no-pull 경로에서는 채워지지 않는다. set -u 라 미리 비워 둬야 한다.
DIRTY=""

for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --no-pull) PULL=0 ;;
    *)
      echo "알 수 없는 옵션: $arg" >&2
      echo "사용법: pnpm run deploy [--reset] [--yes] [--no-pull]" >&2
      exit 2
      ;;
  esac
done

fail() {
  echo "" >&2
  echo "✗ $1" >&2
  exit 1
}

# ── 사전 점검 ────────────────────────────────────────────
[ -f .env ] || fail ".env 가 없습니다. compose 가 비밀값을 읽지 못합니다."
[ -f env-profile.json ] || fail "env-profile.json 이 없습니다. 설정값을 읽지 못합니다."
command -v docker >/dev/null || fail "docker 를 찾을 수 없습니다."
docker info >/dev/null 2>&1 || fail "docker 데몬이 실행 중이 아닙니다."

if [ "$PULL" = 1 ]; then
  DIRTY="$(git status --porcelain)"
  if [ -n "$DIRTY" ]; then
    if [ "$RESET" = 1 ]; then
      echo "⚠ 커밋되지 않은 변경이 있습니다. --reset 이므로 아래 내용은 삭제됩니다:"
      echo "$DIRTY" | sed 's/^/    /'
    else
      echo "커밋되지 않은 변경이 있습니다:" >&2
      echo "$DIRTY" | sed 's/^/    /' >&2
      fail "커밋하거나 정리한 뒤 다시 실행하세요 (강제로 덮어쓰려면 --reset)."
    fi
  fi

  echo "▸ origin/$BRANCH 확인 중…"
  git fetch --prune origin

  BEFORE="$(git rev-parse HEAD)"
  TARGET="$(git rev-parse "origin/$BRANCH")"

  if [ "$BEFORE" = "$TARGET" ] && [ -z "${DIRTY}" ]; then
    echo "  이미 최신입니다 ($(git rev-parse --short HEAD))."
  else
    echo ""
    echo "  적용될 커밋:"
    git --no-pager log --oneline "$BEFORE..$TARGET" | sed 's/^/    /' || true
    echo ""
  fi
fi

# ── 확인 ────────────────────────────────────────────────
# 평소 배포는 묻지 않는다. 재기동은 되돌릴 수 있고, 매번 y 를 누르는 건 번거롭기만 하다.
#
# 딱 한 경우만 남겼다: --reset 은 `git reset --hard` 라 커밋 안 된 변경을 지운다.
# 그건 배포가 아니라 데이터 손실이고 되돌릴 방법이 없어서, 그때만 한 번 묻는다.
# 그것마저 건너뛰려면 --yes 를 붙인다.
echo "배포를 시작합니다 (1. 빌드 → 2. 인프라 확인 → 3. DB 마이그레이션 → 4. 앱 컨테이너 재기동 → 5. 백업·터널)."
echo "마이그레이션이 실패하면 앱 컨테이너는 건드리지 않고 중단됩니다."

if [ "$RESET" = 1 ] && [ -n "$DIRTY" ] && [ "$ASSUME_YES" != 1 ]; then
  echo ""
  printf "위 로컬 변경을 지우고 계속할까요? [y/N] "
  read -r reply
  case "$reply" in
    y | Y | yes) ;;
    *)
      echo "중단했습니다."
      exit 0
      ;;
  esac
fi

# ── 코드 동기화 ─────────────────────────────────────────
if [ "$PULL" = 1 ]; then
  if [ "$RESET" = 1 ]; then
    echo "▸ origin/$BRANCH 으로 강제 동기화"
    git reset --hard "origin/$BRANCH"
  else
    echo "▸ fast-forward pull"
    # 갈라져 있으면 여기서 멈춘다 — 조용히 머지 커밋을 만들지 않는다.
    git merge --ff-only "origin/$BRANCH" ||
      fail "fast-forward 할 수 없습니다. 로컬이 origin/$BRANCH 와 갈라졌습니다 (--reset 으로 강제 동기화 가능)."
  fi
  echo "  현재: $(git rev-parse --short HEAD) $(git log -1 --format=%s)"
fi

# ── 빌드·마이그레이션·기동 ──────────────────────────────
echo "▸ 1/5 이미지 빌드"
"${COMPOSE[@]}" build

echo "▸ 2/5 DB·Redis·MinIO 확인 (꺼져 있으면 띄우고, 떠 있으면 그대로)"
# --no-recreate: 설정이 바뀌었어도 떠 있는 컨테이너를 다시 만들지 않는다. 2026-09-21 사고처럼
# POSTGRES_PASSWORD 가 바뀐 상태면 여기서 DB 가 재시작돼 버린다 — 그 판정은 다음 단계의 migrate 가 한다.
# 이 단계가 없으면 DB 가 꺼진 상태(재부팅·첫 배포·prod:down 뒤)에서 migrate 가 P1001 로 매번 실패한다.
"${COMPOSE[@]}" up -d --no-recreate --wait postgres redis minio

echo "▸ 3/5 DB 마이그레이션 (실행 중인 DB 대상)"
"${COMPOSE[@]}" run --rm --no-deps migrate

echo "▸ 4/5 앱 컨테이너 재기동 (web, api, worker)"
"${COMPOSE[@]}" up -d --force-recreate web api worker

echo "▸ 5/5 백업 및 터널 컨테이너 기동"
# backup/cloudflared 는 --force-recreate 를 빼서,
# 앱 배포마다 백업 cron 과 healthcheck 시작 유예가 리셋되지 않게 한다.
"${COMPOSE[@]}" up -d backup cloudflared

echo "▸ 상태"
"${COMPOSE[@]}" ps

echo ""
echo "✓ 배포 완료. 로그: pnpm prod:logs"
