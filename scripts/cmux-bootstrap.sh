#!/usr/bin/env bash
# ComicAI cmux 워크스페이스 부트스트랩
# - 표준 레이아웃: docs/40-ops/04-cmux-workflow.md
#
# 사용법:
#   ./scripts/cmux-bootstrap.sh
#
# 사전요구:
#   - cmux 설치 및 데몬 실행
#   - 프로젝트 루트에서 실행
#   - .env 및 docker-compose 준비 완료

set -euo pipefail

WORKSPACE="comicai-dev"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cmux() {
  command cmux "$@"
}

echo "▶ Bootstrapping cmux workspace: ${WORKSPACE}"

# 워크스페이스가 이미 있으면 중단 (덮어쓰기 방지)
if cmux workspace list 2>/dev/null | grep -q "^${WORKSPACE}\b"; then
  echo "⚠ Workspace '${WORKSPACE}' already exists. Aborting."
  echo "  Remove first:  cmux workspace remove ${WORKSPACE}"
  exit 1
fi

# 1. 워크스페이스 생성 (작업 디렉토리 = 프로젝트 루트)
cmux workspace create "${WORKSPACE}" --cwd "${ROOT}"

# 2. infra 탭
cmux tab create "${WORKSPACE}" infra
cmux pane send "${WORKSPACE}" infra:0 "docker compose -f infra/compose/dev.yml logs -f postgres redis minio cloudflared"
cmux pane split "${WORKSPACE}" infra:0 --direction horizontal
cmux pane send "${WORKSPACE}" infra:1 "docker stats"

# 3. backend 탭
cmux tab create "${WORKSPACE}" backend
cmux pane send "${WORKSPACE}" backend:0 "pnpm --filter api dev"
cmux pane split "${WORKSPACE}" backend:0 --direction horizontal
cmux pane send "${WORKSPACE}" backend:1 "pnpm --filter worker dev"
cmux pane split "${WORKSPACE}" backend:1 --direction vertical
cmux pane send "${WORKSPACE}" backend:2 "pnpm --filter db studio"

# 4. frontend 탭
cmux tab create "${WORKSPACE}" frontend
cmux pane send "${WORKSPACE}" frontend:0 "pnpm --filter web dev"
cmux pane split "${WORKSPACE}" frontend:0 --direction vertical
# 브라우저 surface는 cmux 브라우저 자동화 기능을 사용
cmux pane send "${WORKSPACE}" frontend:1 "cmux browser open http://localhost:3000"

# 5. agents 탭 (Claude Code 인스턴스용 빈 패널 4개)
cmux tab create "${WORKSPACE}" agents
cmux pane send "${WORKSPACE}" agents:0 "# A-Backend (worktrees/a-backend) — 'claude' 직접 실행"
cmux pane split "${WORKSPACE}" agents:0 --direction horizontal
cmux pane send "${WORKSPACE}" agents:1 "# A-Editor   (worktrees/a-editor)  — 'claude' 직접 실행"
cmux pane split "${WORKSPACE}" agents:0 --direction vertical
cmux pane send "${WORKSPACE}" agents:2 "# A-Adapter  (worktrees/a-adapter) — 'claude' 직접 실행"
cmux pane split "${WORKSPACE}" agents:1 --direction vertical
cmux pane send "${WORKSPACE}" agents:3 "# Orchestrator (main)              — 'claude' 직접 실행"

# 6. qa 탭
cmux tab create "${WORKSPACE}" qa
cmux pane send "${WORKSPACE}" qa:0 "pnpm test --watch"
cmux pane split "${WORKSPACE}" qa:0 --direction horizontal
cmux pane send "${WORKSPACE}" qa:1 "pnpm e2e --watch --ui"
cmux pane split "${WORKSPACE}" qa:1 --direction vertical
cmux pane send "${WORKSPACE}" qa:2 "# A-QA — 'claude' 직접 실행"
cmux pane split "${WORKSPACE}" qa:0 --direction vertical
cmux pane send "${WORKSPACE}" qa:3 "tail -F logs/api/error.log 2>/dev/null || echo 'log file not yet present'"

# 7. 첫 탭 포커스
cmux tab focus "${WORKSPACE}" infra

echo "✅ Workspace '${WORKSPACE}' ready."
echo "   Open with:  cmux workspace open ${WORKSPACE}"
