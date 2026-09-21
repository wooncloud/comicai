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

# node 가 PATH 에 없으면 nvm/Homebrew 에서 찾아 쓴다 (비대화형 러너·ssh 대응).
# 탐색 순서:
#   1. PATH 에 node 가 있으면 그대로 사용
#   2. NODE_BIN 환경변수 (명시 지정)
#   3. nvm: ${NVM_DIR:-$HOME/.nvm}/versions/node/*/bin/node
#      (.nvmrc 와 주 버전 일치 우선, 없으면 가장 높은 버전)
#   4. /opt/homebrew/bin/node, /usr/local/bin/node
find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  [ -n "${NODE_BIN:-}" ] && [ -x "$NODE_BIN" ] && { echo "$NODE_BIN"; return 0; }

  local cands="" cand vdir ver
  for cand in "${NVM_DIR:-${HOME:-}/.nvm}/versions/node"/*/bin/node; do
    [ -x "$cand" ] || continue
    vdir="${cand%/*/*}"
    ver="${vdir##*/}"
    cands="${cands:+$cands
}${ver#v} ${cand}"
  done

  if [ -n "$cands" ]; then
    local target_major="" matched="" pick=""
    if [ -f "$ROOT/.nvmrc" ]; then
      target_major="$(grep -v '^[[:space:]]*#' "$ROOT/.nvmrc" | tr -d '[:space:]' || true)"
      target_major="${target_major#v}"
      target_major="${target_major%%.*}"
    fi
    [ -n "$target_major" ] && matched="$(printf "%s\n" "$cands" | grep "^${target_major}[. ]" || true)"
    pick="$(printf "%s\n" "${matched:-$cands}" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)"
    echo "${pick#* }"
    return 0
  fi

  for cand in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$cand" ] && { echo "$cand"; return 0; }
  done

  return 1
}

NODE_CMD="$(find_node)" || {
  echo "✗ node 를 찾을 수 없습니다. 설정 파일을 만들 수 없습니다 (PATH, NODE_BIN, nvm, Homebrew 확인)." >&2
  exit 1
}

if [ "${COMPOSE_PRINT_NODE:-0}" = "1" ]; then
  echo "$NODE_CMD"
  exit 0
fi

"$NODE_CMD" packages/config/cli.js --write .env.generated >/dev/null

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
