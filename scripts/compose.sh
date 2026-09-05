#!/usr/bin/env bash
# docker compose 호출의 단일 입구.
#
#   bash scripts/compose.sh up -d --build             # full 스택, dev 그룹
#   COMPOSE_STACK=dev bash scripts/compose.sh up -d   # 인프라만 (postgres/redis/minio)
#   APP_ENV=prod bash scripts/compose.sh ps           # prod 그룹 + tunnel/backup 프로파일
#
# 여기 모아 둔 이유는 세 가지가 매번 함께 가야 하기 때문이다.
#
#   1. `.env.generated` 를 먼저 만든다. compose 는 JSON 을 못 읽어서 env-profile.json 이
#      이 파일을 거쳐야 닿는다. 호출부마다 손으로 붙이면 언젠가 한 곳이 빠지고,
#      그때 컨테이너는 **옛 설정으로 조용히 뜬다**.
#   2. env-file 순서. 뒤가 이긴다 — 프로파일(공개 설정) 다음에 .env(비밀·오버라이드).
#   3. prod 는 tunnel·backup 프로파일이 항상 함께다. 여덟 개 스크립트에 복사돼 있었다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_ENV="${APP_ENV:-dev}"
export APP_ENV

# full = 전체 스택, dev = 인프라만. 둘 다 같은 .env.generated 를 읽는다.
STACK="${COMPOSE_STACK:-full}"

command -v node >/dev/null || { echo "✗ node 를 찾을 수 없습니다. 설정 파일을 만들 수 없습니다." >&2; exit 1; }
node packages/config/cli.js --write .env.generated >/dev/null

# 빈 배열 전개는 macOS 기본 bash 3.2 + `set -u` 에서 unbound variable 로 죽는다.
ARGS=(-f "infra/compose/${STACK}.yml" --env-file .env.generated)

# 갓 클론한 저장소에는 .env 가 없다. 없는 env-file 을 넘기면 compose 가 그냥 실패하는데,
# 그 시점에 사람이 알아야 할 것은 "compose 사용법" 이 아니라 ".env 를 만들라" 다.
if [ -f .env ]; then
  ARGS+=(--env-file .env)
else
  echo "⚠ .env 가 없습니다 — 비밀값 없이 뜹니다. .env.example 을 복사해 채우세요." >&2
fi

if [ "$APP_ENV" = "prod" ]; then
  ARGS+=(--profile tunnel --profile backup)
fi

exec docker compose "${ARGS[@]}" "$@"
