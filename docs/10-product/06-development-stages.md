# 개발 단계별 필독 문서 매핑

> v0.1 — 2026-05-16 — Draft
> ⭐ 본 문서는 SSOT. 50+ 문서를 다 읽지 말고, **현재 단계의 Required만** 읽고 개발 시작.

## 사용법

1. 자신의 현재 마일스톤 확인.
2. **Required** 섹션 문서를 모두 읽음 (필수).
3. **Recommended** 는 작업 중 막힐 때 참조.
4. **Reference** 는 검색용.
5. 끝에 있는 **DO NOT TOUCH**로 본인 단계에서 손대지 말 영역 확인.

---

## M0 — 기반 인프라

### Required (반드시 읽기)
- [`../00-overview/01-product-vision.md`](../00-overview/01-product-vision.md)
- [`../30-tech/01-architecture-overview.md`](../30-tech/01-architecture-overview.md)
- [`../40-ops/01-deployment.md`](../40-ops/01-deployment.md)
- [`../40-ops/02-local-dev.md`](../40-ops/02-local-dev.md)
- [`../30-tech/08-security.md`](../30-tech/08-security.md) (API 키 암호화 부분)

### Recommended
- [`../90-decisions/0007-cloudflare-tunnel-personal-pc.md`](../90-decisions/0007-cloudflare-tunnel-personal-pc.md)
- [`../30-tech/09-storage.md`](../30-tech/09-storage.md)

### Reference
- [`../00-overview/02-glossary.md`](../00-overview/02-glossary.md)

### 산출물
docker-compose.yml, Next/Nest 스캐폴딩, 인증, API 키 등록 화면.

### DO NOT TOUCH
- 에디터 코드 (`apps/web/app/editor/**`)
- 모델 어댑터 (`packages/adapters/**`)
- 일관성 CRUD UI

---

## M1 — 데이터 모델 + 더미 렌더

### Required
- [`../30-tech/02-data-model.md`](../30-tech/02-data-model.md)
- [`../30-tech/03-api-contracts.md`](../30-tech/03-api-contracts.md)
- [`../30-tech/04-render-pipeline.md`](../30-tech/04-render-pipeline.md)
- [`../30-tech/05-mention-serialization.md`](../30-tech/05-mention-serialization.md)
- [`../30-tech/06-model-adapters.md`](../30-tech/06-model-adapters.md) (인터페이스 + MockAdapter 부분만)

### Recommended
- [`../30-tech/07-error-reliability.md`](../30-tech/07-error-reliability.md)
- [`../90-decisions/0004-bullmq-redis.md`](../90-decisions/0004-bullmq-redis.md)
- [`../90-decisions/0006-panel-level-rendering.md`](../90-decisions/0006-panel-level-rendering.md)

### Reference
- [`02-feature-list.md`](./02-feature-list.md)

### 산출물
타입 패키지, Postgres 마이그레이션, MockAdapter, BullMQ 잡, SSE 채널.

### DO NOT TOUCH
- 실제 모델 API 호출 코드 (M3에서)
- UI 화면 (M2에서)

---

## M2 — 에디터 PoC

### Required
- [`../20-ux/00-information-architecture.md`](../20-ux/00-information-architecture.md)
- [`../20-ux/01-interaction-principles.md`](../20-ux/01-interaction-principles.md)
- [`../20-ux/screens/12-page-editor.md`](../20-ux/screens/12-page-editor.md) ⭐
- [`../20-ux/components/01-shell-layout.md`](../20-ux/components/01-shell-layout.md)
- [`../20-ux/components/02-mention-input.md`](../20-ux/components/02-mention-input.md)
- [`../20-ux/components/03-panel-status-badge.md`](../20-ux/components/03-panel-status-badge.md)
- [`../90-decisions/0003-tldraw-editor.md`](../90-decisions/0003-tldraw-editor.md)

### Recommended
- [`../20-ux/screens/06-project-home.md`](../20-ux/screens/06-project-home.md)
- [`../20-ux/screens/07-consistency-style.md`](../20-ux/screens/07-consistency-style.md)
- [`../20-ux/screens/08-consistency-character.md`](../20-ux/screens/08-consistency-character.md)
- [`../20-ux/screens/09-consistency-background.md`](../20-ux/screens/09-consistency-background.md)
- [`../20-ux/screens/10-consistency-worldview.md`](../20-ux/screens/10-consistency-worldview.md)
- [`../20-ux/02-design-tokens.md`](../20-ux/02-design-tokens.md)

### Reference
- [`../30-tech/02-data-model.md`](../30-tech/02-data-model.md)

### 산출물
tldraw 캔버스, 패널 도형, 콘티, TipTap+멘션, 일관성 CRUD UI.

### DO NOT TOUCH
- 모델 어댑터 본체 (`packages/adapters/`)
- 인프라 (`docker-compose.yml`)

---

## M3 — Gemini 어댑터 + 일관성 PoC

### Required
- [`../30-tech/06-model-adapters.md`](../30-tech/06-model-adapters.md) (전체)
- [`../30-tech/05-mention-serialization.md`](../30-tech/05-mention-serialization.md)
- [`../30-tech/07-error-reliability.md`](../30-tech/07-error-reliability.md)
- [`../90-decisions/0002-no-stable-diffusion.md`](../90-decisions/0002-no-stable-diffusion.md)

### Recommended
- [`../00-overview/03-personas-scenarios.md`](../00-overview/03-personas-scenarios.md)
- [`05-open-questions.md`](./05-open-questions.md) (Q-02, Q-04)

### Reference
- [`../../REQUIREMENTS.md`](../../REQUIREMENTS.md)

### 산출물
Gemini 어댑터, OpenAI 어댑터, 단일 캐릭터+배경+3페이지 PoC.

### DO NOT TOUCH
- 신규 UI 추가 금지 (다듬기는 M4)

---

## M4 — 다듬기

### Required
- [`../20-ux/components/04-history-tray.md`](../20-ux/components/04-history-tray.md)
- [`../20-ux/components/05-toast-error-card.md`](../20-ux/components/05-toast-error-card.md)
- [`../20-ux/screens/13-page-export.md`](../20-ux/screens/13-page-export.md)
- [`../30-tech/10-non-functional.md`](../30-tech/10-non-functional.md)

### Recommended
- [`../40-ops/03-observability.md`](../40-ops/03-observability.md)

### Reference
- 전체

### 산출물
히스토리, 내보내기, 에러 UX, 자동저장, 백업.

### DO NOT TOUCH
- 핵심 데이터 모델 변경 금지 (마이그레이션 비용)

---

## 단계 진입 체크리스트 (공통)

각 단계 시작 전:
- [ ] 이전 단계 종료 조건([`04-roadmap-milestones.md`](./04-roadmap-milestones.md))이 충족되었는가?
- [ ] 현재 단계 Required 문서를 모두 읽었는가?
- [ ] 자신이 어느 에이전트 역할인지([`07-agent-roster.md`](./07-agent-roster.md))?
- [ ] 작업 티켓이 발행되어 있는가?
- [ ] DO NOT TOUCH 영역을 확인했는가?

## 변경 이력
- 2026-05-16: 초기 작성
