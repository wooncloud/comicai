# 로드맵 / 마일스톤

> v0.1 — 2026-05-16 — Draft

## 마일스톤 개요

| 단계 | 기간 | 핵심 산출물 | 종료 조건 |
|---|---|---|---|
| M0 | 1~2주 | 도커 스택, Next/Nest 스캐폴딩, 인증, BYOK 키 등록 | 로컬에서 가입/로그인/키 등록 가능 |
| M1 | 1~2주 | 데이터 모델, MockAdapter, BullMQ+SSE | "더미 검정 사각형" 렌더가 큐→워커→SSE→UI로 흐름 |
| M2 | 2~3주 | tldraw 에디터, TipTap+멘션, 일관성 CRUD | 프로젝트 생성→캐릭터 등록→패널 그리기→텍스트+멘션 입력 가능 |
| M3 | 2주 | Gemini 어댑터, 일관성 PoC | 단일 캐릭터+단일 배경으로 3페이지 일관성 검증 통과 |
| M4 | 1~2주 | 히스토리, 내보내기, 에러 UX, 자동저장, 백업 | 베타 사용자 5~10명 피드백 수집 |

## M0 — 기반 인프라
- [ ] `docker-compose.yml` (postgres, redis, minio, cloudflared, web, api, worker)
- [ ] Next.js + Nest.js 스캐폴딩 (모노레포: pnpm workspace)
- [ ] NextAuth (이메일/Google/GitHub)
- [ ] API 키 등록 화면 + 암호화 저장
- [ ] 헬스체크 엔드포인트

## M1 — 데이터 모델 + 더미 렌더
- [ ] Postgres 스키마 마이그레이션
- [ ] `ConsistencyEntity`, `Panel`, `RenderJob`, `RenderIR` 타입 패키지
- [ ] `ModelAdapter` 인터페이스 + `MockAdapter`
- [ ] BullMQ 큐 + 워커
- [ ] SSE 채널 + 클라이언트 hook

## M2 — 에디터 PoC
- [ ] 페이지 에디터 셸 레이아웃 (Topbar / Sidebar / Canvas / Inspector)
- [ ] tldraw 캔버스 + 패널 도형 도구
- [ ] 콘티 스케치 레이어
- [ ] TipTap 텍스트 + `@`멘션 자동완성
- [ ] 일관성 정보 CRUD 화면 (그림체/캐릭터/배경/세계관)
- [ ] 패널 상태 뱃지

## M3 — Gemini 어댑터 + 일관성 PoC
- [ ] Gemini nano banana 어댑터 구현
- [ ] 에러 분류 (Auth/Quota/Safety/Transient/Timeout/Invalid)
- [ ] 단일 캐릭터로 5컷 일관성 테스트 (사람 검증)
- [ ] OpenAI 어댑터 (차순위)

## M4 — 다듬기
- [ ] 히스토리 트레이 (20개 FIFO)
- [ ] 페이지 내보내기 (JPG/PNG/DPI)
- [ ] 에러 카드 UX
- [ ] 자동저장 + 충돌 방지
- [ ] 일 1회 DB dump + 외부 백업

## 변경 이력
- 2026-05-16: 초기 작성
