# Git 워크플로우 / 커밋 컨벤션

> v0.1 — 2026-05-16 — Draft
> **모든 에이전트(사람·AI)는 본 규칙을 준수한다.** 작업 단위마다 즉시 커밋.

## 1. 핵심 원칙

> **작업(task) 1개 = 커밋 1개.**

- 티켓 1개를 여러 단계로 나눈다면 **각 단계마다 커밋**.
- 의미 있는 단위로 끊어서 자주 커밋. 거대한 단일 커밋 금지.
- 빨간 빌드(테스트 실패)는 커밋 금지. 작업 중간 저장이 필요하면 wip 브랜치 사용.
- 같은 PR 안에서도 커밋은 작은 단위로 유지하면 코드 리뷰가 쉬워진다.

## 2. 브랜치 전략

- `main` — 항상 배포 가능.
- `feature/M{N}-{agent}-{slug}` — 마일스톤·에이전트·작업 슬러그.
  - 예: `feature/M1-backend-render-job-schema`
- `fix/{slug}` — 단순 버그 수정.
- `chore/{slug}` — 빌드/툴/문서 등 기능 외.
- 에이전트별 worktree: `worktrees/{agent}/` (예: `worktrees/a-editor`).

머지: PR + 스쿼시 머지(소규모) 또는 리베이스(시리즈가 의미 있을 때).

## 3. 커밋 메시지 컨벤션 (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변화 없는 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가/수정 |
| `docs` | 문서만 변경 |
| `chore` | 빌드/도구/설정 |
| `style` | 포맷팅(기능 영향 없음) |
| `build` | 빌드 시스템 / 의존성 |
| `ci` | CI 설정 |
| `revert` | 이전 커밋 되돌리기 |

### Scope (본 프로젝트 표준)

`web`, `api`, `worker`, `db`, `adapters`, `types`, `events`, `editor`, `consistency`, `auth`, `apikeys`, `render`, `infra`, `docs`, `tests`, `e2e`.

### Subject 규칙
- 한국어 권용 (영문도 OK, 프로젝트 내 일관성만 유지).
- 명령형 현재시제: "추가한다" 아닌 "추가" / "add" 아닌 "add", "added" X.
- 마침표 없음.
- 50자 이하 권장.

### Body
- 선택. **왜** 변경했는지 (무엇은 diff가 말해줌).
- 한 줄당 72자.

### Footer
- `BREAKING CHANGE:` — 호환성 깨짐.
- `Refs: TICKET-ID` 또는 `Closes #N`.

### 예시
```
feat(editor): 패널 도형 그리기 도구 추가

tldraw 커스텀 shape "panel"을 정의하고 좌상단 도구 패널에
도형 도구를 추가했다. 패널 선택 시 우측 Inspector가
패널 속성을 표시하도록 연결.

Refs: M2-editor-panel-shape
```

```
fix(adapters): Gemini 429 응답을 transient 카테고리로 분류

기존엔 quota로 잘못 분류되어 재시도하지 않았음. 재시도
가능하도록 transient로 매핑.

Refs: M3-adapter-error-classify
```

```
docs(adr): ADR-0008 OpenAPI 코드젠 도구 채택 결정 기록
```

```
chore(infra): docker-compose에 minio 컨테이너 추가
```

## 4. 작업 단위 커밋 가이드

각 에이전트는 다음 시점에 반드시 커밋:

| 시점 | 예시 |
|---|---|
| 한 파일 그룹 작업 단락 | "스키마 추가" / "라우트 추가" / "테스트 추가" |
| 타입 변경 | `feat(types): RenderIR 추가` — 별도 PR |
| 마이그레이션 추가 | `feat(db): consistency_entities 테이블 마이그레이션` |
| 테스트 그린 후 | `test(api): render queue 통합 테스트 추가` |
| 문서 변경 | `docs(tech): mention serialization 스펙 명세화` |

**금지**: "wip", "fix", "update", "stuff" 같은 모호한 메시지. (단 임시 푸시 전용 wip 브랜치 제외.)

## 5. PR 컨벤션

### 제목
`[A-{Agent}] feat(scope): subject` 또는 동일 컨벤션.

예: `[A-Editor] feat(editor): 멘션 자동완성 통합`

### 본문 템플릿
```markdown
## 변경 사항
- 무엇을 했는가 (bullet)

## 이유 / 컨텍스트
- 왜 했는가 (필요 시)

## 관련 문서
- 필독: docs/...
- 인수기준: docs/10-product/03-acceptance-criteria.md#...

## 테스트
- [ ] unit
- [ ] integration
- [ ] e2e (해당 시)
- [ ] 시각 회귀 (해당 시)

## 영향 범위
- 인터페이스 변경: Y/N
- 마이그레이션: Y/N
- 환경변수 추가: Y/N

## DO NOT TOUCH 위반 여부
- N (또는 사유)
```

### 머지 조건
1. CI 통과 (lint, typecheck, unit, integration).
2. 관련 에이전트(또는 Orchestrator) 1인 이상 리뷰.
3. 인터페이스 변경이면 의존 에이전트 모두 확인.

## 6. Pre-commit 훅 (Husky + lint-staged)

자동 실행:
- `pnpm lint --fix` (변경 파일만)
- `pnpm typecheck`
- `pnpm test --changed`

훅 실패 → 커밋 차단. **`--no-verify` 사용 금지** (사용자가 명시 지시한 경우만).

## 7. 보호 규칙

- `main` 직접 push 금지. PR 머지만.
- `main`에 force-push 금지.
- Squash 또는 Rebase 머지만 허용 (merge commit 비허용).
- 보호 파일 변경 시 추가 리뷰어:
  - `packages/types/**` — A-Backend 필수 리뷰
  - `apps/api/openapi.yaml` — A-Backend + 모든 Frontend 에이전트
  - `docker-compose.yml` — A-Infra
  - `90-decisions/**` — Orchestrator

## 8. AI 에이전트 특이사항

- 커밋 메시지에 "🤖 Generated with..." 같은 자동 서명 **금지** (사용자 글로벌 지침 반영, [`../../.claude/CLAUDE.md`](../../../.claude/CLAUDE.md) 참조).
- `Co-Authored-By` 라인 **금지** (사용자 글로벌 지침).
- 에이전트가 자기 작업을 끝낼 때마다 본 컨벤션으로 커밋 후 사용자에게 보고.
- 의심스러우면 커밋 전 사용자에게 확인 — 특히 인터페이스/스키마 변경.

## 변경 이력
- 2026-05-16: 초기 작성
