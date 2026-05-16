# ComicAI 문서 인덱스

> v0.1 — 2026-05-16

## 폴더 구조

| 폴더 | 목적 |
|---|---|
| `00-overview/` | 제품 비전, 용어 사전, 페르소나/시나리오 |
| `10-product/` | 유저 플로우, 기능 목록, 인수 기준, 마일스톤, 단계별 필독, 에이전트 로스터, 미해결 |
| `20-ux/` | IA, 인터랙션 원칙, 디자인 토큰, 공통 컴포넌트, 화면별 와이어프레임 |
| `30-tech/` | 아키텍처, 데이터 모델, API, 렌더 파이프라인, 멘션 직렬화, 모델 어댑터, 에러/신뢰성, 보안, 스토리지, 비기능 |
| `40-ops/` | 배포, 로컬 개발, 관측성, cmux 워크플로우, 테스트 전략 |
| `90-decisions/` | ADR (Architecture Decision Records) |

## 신규 기여자 권장 읽기 순서

1. [`../REQUIREMENTS.md`](../REQUIREMENTS.md) — 사용자 원본 (영문)
2. [`../PRD.md`](../PRD.md) — 30초 요약
3. [`00-overview/01-product-vision.md`](./00-overview/01-product-vision.md)
4. [`00-overview/02-glossary.md`](./00-overview/02-glossary.md)
5. [`10-product/06-development-stages.md`](./10-product/06-development-stages.md) — **현재 어느 단계에서 무엇을 읽어야 하는지** 매핑
6. 자기 역할(에이전트) → [`10-product/07-agent-roster.md`](./10-product/07-agent-roster.md)

## 문서 작성 규약

- 언어: 한국어 (코드/기술 용어는 영문)
- 다이어그램: ASCII 우선
- 상단에 버전 헤더 1줄: `> v0.1 — YYYY-MM-DD — Draft`
- 결정 안 된 부분은 `> TBD: …` 인용블록 (grep 가능)
- 문서 간 링크는 상대경로
- 큰 변경은 문서 하단 "변경 이력" 섹션 1줄 추가

## 커밋 / PR 컨벤션

모든 작업은 **작업 단위마다 커밋**한다. Conventional Commits 사용. 상세: [`40-ops/06-git-workflow.md`](./40-ops/06-git-workflow.md).

## 전체 문서 목록

### 00-overview
- [01-product-vision.md](./00-overview/01-product-vision.md)
- [02-glossary.md](./00-overview/02-glossary.md)
- [03-personas-scenarios.md](./00-overview/03-personas-scenarios.md)

### 10-product
- [01-user-flows.md](./10-product/01-user-flows.md)
- [02-feature-list.md](./10-product/02-feature-list.md)
- [03-acceptance-criteria.md](./10-product/03-acceptance-criteria.md)
- [04-roadmap-milestones.md](./10-product/04-roadmap-milestones.md)
- [05-open-questions.md](./10-product/05-open-questions.md)
- [06-development-stages.md](./10-product/06-development-stages.md) ⭐
- [07-agent-roster.md](./10-product/07-agent-roster.md) ⭐

### 20-ux
- [00-information-architecture.md](./20-ux/00-information-architecture.md)
- [01-interaction-principles.md](./20-ux/01-interaction-principles.md)
- [02-design-tokens.md](./20-ux/02-design-tokens.md)
- components/ — 5 files
- screens/ — 16 files (⭐ `12-page-editor.md` 핵심)

### 30-tech
- [01-architecture-overview.md](./30-tech/01-architecture-overview.md)
- [02-data-model.md](./30-tech/02-data-model.md)
- [03-api-contracts.md](./30-tech/03-api-contracts.md)
- [04-render-pipeline.md](./30-tech/04-render-pipeline.md)
- [05-mention-serialization.md](./30-tech/05-mention-serialization.md)
- [06-model-adapters.md](./30-tech/06-model-adapters.md)
- [07-error-reliability.md](./30-tech/07-error-reliability.md)
- [08-security.md](./30-tech/08-security.md)
- [09-storage.md](./30-tech/09-storage.md)
- [10-non-functional.md](./30-tech/10-non-functional.md)

### 40-ops
- [01-deployment.md](./40-ops/01-deployment.md)
- [02-local-dev.md](./40-ops/02-local-dev.md)
- [03-observability.md](./40-ops/03-observability.md)
- [04-cmux-workflow.md](./40-ops/04-cmux-workflow.md) ⭐
- [05-testing-strategy.md](./40-ops/05-testing-strategy.md)
- [06-git-workflow.md](./40-ops/06-git-workflow.md) ⭐ 커밋 컨벤션

### 90-decisions
- [0000-template.md](./90-decisions/0000-template.md)
- [0001-byok-for-mvp.md](./90-decisions/0001-byok-for-mvp.md)
- [0002-no-stable-diffusion.md](./90-decisions/0002-no-stable-diffusion.md)
- [0003-tldraw-editor.md](./90-decisions/0003-tldraw-editor.md)
- [0004-bullmq-redis.md](./90-decisions/0004-bullmq-redis.md)
- [0005-minio-not-volume.md](./90-decisions/0005-minio-not-volume.md)
- [0006-panel-level-rendering.md](./90-decisions/0006-panel-level-rendering.md)
- [0007-cloudflare-tunnel-personal-pc.md](./90-decisions/0007-cloudflare-tunnel-personal-pc.md)
