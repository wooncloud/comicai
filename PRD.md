# ComicAI — PRD (Index)

> v0.2 — 2026-05-16
> 상세 문서는 `docs/` 로 분산. 본 문서는 30초 요약 + 인덱스.

## 한 줄 정의
**AI가 만화의 일관성(캐릭터·배경·세계관·그림체)을 유지하며 만화를 그려주는 웹 제작 도구.**

## 핵심 가치 제안
- 작가가 캐릭터·배경·그림체를 한 번 정의 → AI가 이후 모든 패널에서 설정을 유지한 채 생성.
- 패널 단위 정밀 제어(콘티 + 텍스트 + 멘션 + 참조 이미지).

## 타깃 / BM / 비목표
- 1차 타깃: 한국의 1인 만화 창작자 (기술 친화 얼리어답터).
- 비즈니스 모델: MVP는 BYOK → Post-MVP 크레딧 구매 → Long-term 구독.
- 비목표(MVP): 커뮤니티/연재, 협업 편집, 모바일 앱, SD/LoRA, 해외 시장.

## 마일스톤 요약
| | 기간 | 목적 |
|---|---|---|
| M0 | 1~2주 | 인프라(Docker, Nest/Next, 인증, BYOK 키) |
| M1 | 1~2주 | 데이터 모델 + 더미 렌더 (MockAdapter 흐름) |
| M2 | 2~3주 | 에디터 PoC (tldraw, TipTap, 멘션, 일관성 CRUD) |
| M3 | 2주 | Gemini 어댑터 + 일관성 PoC |
| M4 | 1~2주 | 히스토리, 내보내기, 에러 UX, 백업 |

---

## 문서 인덱스

| 카테고리 | 경로 | 다루는 내용 |
|---|---|---|
| 원본 요구사항 | [`REQUIREMENTS.md`](./REQUIREMENTS.md) | 사용자 원본 (영문) |
| 개요 | [`docs/00-overview/`](./docs/00-overview/) | 비전, 용어, 페르소나 |
| 제품 | [`docs/10-product/`](./docs/10-product/) | 유저 플로우, 기능 목록, 마일스톤, 단계별 필독, 에이전트 로스터 |
| UX | [`docs/20-ux/`](./docs/20-ux/) | IA, 컴포넌트, 화면별 와이어프레임 |
| 기술 | [`docs/30-tech/`](./docs/30-tech/) | 아키텍처, 데이터, API, 렌더 파이프라인, 어댑터, 보안 |
| 운영 | [`docs/40-ops/`](./docs/40-ops/) | 배포, 로컬 개발, 관측성, cmux 워크플로우, 테스트 |
| 결정 | [`docs/90-decisions/`](./docs/90-decisions/) | ADR 모음 |

**진입점**: 신규 기여자는 `docs/README.md` → `docs/00-overview/01-product-vision.md` → `docs/10-product/06-development-stages.md` 순서로 읽으면 됨.
