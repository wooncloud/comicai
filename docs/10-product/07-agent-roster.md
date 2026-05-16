# 에이전트 로스터 (Agent Roster)

> v0.1 — 2026-05-16 — Draft
> 여러 Claude Code 인스턴스를 cmux 패널에서 동시 구동해 병렬 개발한다. 각 에이전트는 고유 스코프·소유 디렉토리·금지 영역을 가진다.

## 전체 표

| 에이전트 | 스코프 | 소유 디렉토리 | 필독 문서 카테고리 | 금지 영역 |
|---|---|---|---|---|
| **A-Infra** | 도커, CI, cloudflared, 백업 | `infra/`, `docker-compose.yml`, `.github/`, `scripts/` | `40-ops/*`, `30-tech/01,08,09` | 앱 코드 |
| **A-Backend** | Nest API, BullMQ 워커, DB 마이그레이션 | `apps/api/`, `packages/db/`, `packages/types/` | `30-tech/01~07`, `10-product/02` | 프론트, 어댑터 본체 |
| **A-Frontend-Shell** | Next 라우팅, 인증, 레이아웃, 설정 화면 | `apps/web/app/(auth)/`, `apps/web/app/(dashboard)/`, `apps/web/components/shell/` | `20-ux/00,01,02`, screens `01~05, 14~16` | 에디터, 어댑터 |
| **A-Editor** | tldraw, TipTap, 멘션, 콘티, 패널 도형 | `apps/web/app/editor/`, `apps/web/components/editor/` | `20-ux/screens/12`, components `02,03`, ADR-0003 | API 라우팅, 어댑터 |
| **A-Consistency** | 일관성 정보 CRUD (UI + API) | `apps/web/app/consistency/`, `apps/api/src/consistency/` | `20-ux/screens/07~10`, `30-tech/02,05` | 에디터, 모델 호출 |
| **A-Adapter** | Gemini/OpenAI 어댑터, 에러 분류 | `packages/adapters/` | `30-tech/05,06,07`, ADR-0002 | 프론트, API 라우팅 |
| **A-QA** | 테스트, E2E, 픽스처, 시각 회귀 | `tests/`, `e2e/`, `fixtures/` | 모든 화면·기술 문서 | 앱 본체 (테스트 코드만) |
| **Orchestrator** | 티켓 발행, 충돌 중재, 사용자 대화 | (없음, 메타) | 모든 인덱스 + open-questions | 직접 코드 작성은 지양 |

---

## 인터페이스 = 불변 계약

다음은 에이전트 간 충돌의 원천. 단일 owner가 관리하고 다른 에이전트는 PR로 변경 요청:

| 계약 | 위치 | Owner |
|---|---|---|
| TypeScript 타입 | `packages/types/` | A-Backend |
| OpenAPI 스펙 | `apps/api/openapi.yaml` | A-Backend |
| SSE 이벤트 스키마 | `packages/events/` | A-Backend |
| 어댑터 인터페이스 | `packages/adapters/src/index.ts` | A-Adapter |
| 디자인 토큰 | `apps/web/lib/theme.ts` | A-Frontend-Shell |

---

## 작업 분할 워크플로우

```
[사용자/Orchestrator]
   ↓ 마일스톤 시작
[티켓 발행]
   tickets/M{N}-{agent}-{슬러그}.md
   ↓
[각 에이전트]
   - 자기 티켓 + Required 문서만 읽기
   - 별도 git worktree (worktrees/{agent}/) 또는 브랜치
   - 작업 → 자체 테스트 → 통과 후 PR
   ↓
[PR 머지 순서]
   인터페이스(types/openapi) → 백엔드 → 어댑터 → 프론트
   ↓
[A-QA]
   머지된 main 기준 회귀 테스트 작성
```

## 충돌 방지 규칙

1. **다른 에이전트 디렉토리 수정 금지**. 필요 시 Orchestrator에게 요청.
2. **인터페이스(types) 변경은 별도 PR**로 먼저 머지. 이후 의존 코드 수정.
3. **공통 파일** (`package.json`, `tsconfig.json` 등)은 Orchestrator만 수정.
4. PR 제목 prefix로 에이전트 식별: `[A-Editor] feat(editor): 콘티 도구 추가`.

## 커밋 규칙 (필수)

모든 에이전트는 **작업 단위마다 즉시 커밋**한다. 커밋 메시지/PR 컨벤션은 [`../40-ops/06-git-workflow.md`](../40-ops/06-git-workflow.md) 참조. 핵심:

- 티켓 1개 = 다수의 의미 있는 커밋 (단일 거대 커밋 금지).
- Conventional Commits: `<type>(<scope>): <subject>`.
- 한 작업 단락(파일 그룹, 테스트 통과, 문서 갱신 등)이 끝날 때마다 커밋.
- `Co-Authored-By` 라인 / "🤖 Generated" 서명 금지.
- 인터페이스/스키마 변경은 별도 커밋 → 별도 PR로 먼저 머지.

## 티켓 템플릿

```markdown
# Ticket: M{N}-{agent}-{slug}

- 담당: A-{Agent}
- 마일스톤: M{N}
- 필독 문서: (필독 문서 매핑에서 복사)
- 결과물: …
- 인터페이스 변경 필요?: Y/N (Y면 Orchestrator 사전 승인)
- 테스트: …
- DO NOT TOUCH: …
```

## 변경 이력
- 2026-05-16: 초기 작성
