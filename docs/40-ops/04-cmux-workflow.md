# cmux 워크플로우

> v0.1 — 2026-05-16 — Draft
> cmux는 vertical-tab 터미널 + scriptable Unix socket. 본 프로젝트의 멀티 에이전트 개발 / 자동 QA의 기반.

## 워크스페이스 표준 레이아웃 (`comicai-dev`)

```
[Workspace: comicai-dev]
 ├─ tab "infra"
 │    ├─ pane: docker compose logs -f postgres redis minio cloudflared
 │    └─ pane: docker stats
 ├─ tab "backend"
 │    ├─ pane: pnpm --filter api dev          (Nest)
 │    ├─ pane: pnpm --filter worker dev       (BullMQ consumer)
 │    └─ pane: psql / Prisma Studio
 ├─ tab "frontend"
 │    ├─ pane: pnpm --filter web dev          (Next)
 │    └─ pane: cmux browser surface (localhost:3000)
 ├─ tab "agents"
 │    ├─ pane: Claude Code — A-Backend     (worktree)
 │    ├─ pane: Claude Code — A-Editor      (worktree)
 │    ├─ pane: Claude Code — A-Adapter     (worktree)
 │    └─ pane: Claude Code — Orchestrator  (main)
 └─ tab "qa"
      ├─ pane: pnpm test --watch       (Vitest)
      ├─ pane: pnpm e2e --watch        (Playwright headed)
      ├─ pane: Claude Code — A-QA
      └─ pane: tail -f logs/api/error.log
```

## 자동 부트스트랩

```bash
./scripts/cmux-bootstrap.sh
```
- 워크스페이스 `comicai-dev` 생성.
- 위 레이아웃대로 탭/패널 자동 구성.
- 각 패널에 명령 send-keys로 실행.

## 자동 QA 루프

1. **파일 저장 → 테스트 자동**: Vitest/Playwright watch 모드. 실패 시 cmux notification.
2. **PR 생성 → 회귀 E2E**: GitHub Actions에서 cmux remote-trigger로 로컬 머신 E2E 실행.
3. **에이전트 자가검증**: 작업 완료 시 자기 영역의 테스트를 QA pane에 send-keys로 보내고 결과 확인 후 보고.
4. **에러 → 에이전트 호출**: 백엔드 ERROR 로그 발생 → cmux notification → Orchestrator pane에 자동 메시지 전송 → 에이전트가 분석.

## 디버깅 표준 절차

문제 발생 시 순서:
1. `infra` 탭 — `docker compose ps`, 컨테이너 health.
2. `backend` 탭 — Nest 콘솔 ERROR.
3. `qa` 탭 — 관련 테스트 재실행.
4. `frontend` 브라우저 surface — DevTools 네트워크/콘솔.
5. `backend` psql — 데이터 직접 검증.
6. 막히면 Orchestrator pane에 전체 컨텍스트 전달.

## 멀티 에이전트 + worktree

```bash
git worktree add worktrees/a-editor feature/m2-editor
cd worktrees/a-editor && claude  # 해당 worktree에서 Claude Code 시작
```

각 에이전트는 worktree에서 작업 → main 충돌 격리. PR 머지 후 worktree 정리.

## cmux 단축어 (예시)

| 키 | 동작 |
|---|---|
| `Cmd+Opt+1~5` | 탭 전환 |
| `Cmd+Shift+T` | 새 탭 |
| `Cmd+Shift+\` | 패널 분할 (수평) |
| `Cmd+Shift+-` | 패널 분할 (수직) |

> 실제 키는 사용자 환경 설정에 따름.

## 변경 이력
- 2026-05-16: 초기 작성
