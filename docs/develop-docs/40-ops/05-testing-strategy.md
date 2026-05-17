# 테스트 전략

> v0.1 — 2026-05-16 — Draft

## 테스트 피라미드

| 레이어             | 도구                          | 대상                                              | 위치                           |
| ------------------ | ----------------------------- | ------------------------------------------------- | ------------------------------ |
| **Unit**           | Vitest                        | 유틸, 멘션 파서, 에러 분류기, 어댑터 buildRequest | `*.test.ts` 코로케이션         |
| **Integration**    | Vitest + testcontainers       | DB 마이그레이션, Repository, BullMQ 잡            | `tests/integration/`           |
| **Adapter (계약)** | Vitest + MSW                  | 모델 어댑터 (Gemini/OpenAI 응답 fixture)          | `packages/adapters/__tests__/` |
| **E2E**            | Playwright                    | 핵심 흐름 (가입→프로젝트→캐릭터→패널→렌더)        | `e2e/`                         |
| **시각 회귀**      | Playwright `toHaveScreenshot` | 페이지 에디터, 일관성 카드                        | `e2e/visual/`                  |

## 우선 테스트 시나리오 (E2E)

1. **회원가입 → 로그인 → API 키 등록** (M0 검증).
2. **프로젝트 생성 → 캐릭터 등록 → 첫 패널 → MockAdapter 렌더** (M1 검증).
3. **TipTap @멘션 자동완성 → 노드 삽입 → 텍스트 치환 결과 확인** (M2 검증).
4. **Gemini 어댑터로 실제 렌더 → 결과 표시** (M3 검증, BYOK 키 환경변수 필요).
5. **렌더 실패 → 재시도 UX → 에러 카드** (M4 검증).

## 픽스처

- `fixtures/users.ts` — 테스트 사용자.
- `fixtures/images/` — 캐릭터 시트, 배경 샘플.
- `fixtures/gemini-responses/` — Gemini 응답 모킹용 JSON.

## 품질 게이트 (Quality Gates)

마일스톤 종료 시 모두 충족 필요:

| 게이트        | 통과 기준                                          |
| ------------- | -------------------------------------------------- | ----------------------------------- |
| Unit 커버리지 | `apps/api/src/` ≥ 70%, `packages/adapters/` ≥ 85%  |
| E2E           | M2 종료 시 핵심 흐름 1개 그린, M4 종료 시 5개 그린 |
| Lint / Type   | `pnpm lint && pnpm typecheck` 무경고               |
| 시각 회귀     | 베이스라인과 diff 0                                |
| 보안          | `grep -rE 'sk-[A-Za-z0-9]{20,}                     | AIza[0-9A-Za-z\\-_]{35}' logs/` 0건 |
| 문서          | 변경된 영역의 docs 업데이트 PR 포함                |

## CI

- GitHub Actions: PR마다 lint + typecheck + unit + integration.
- E2E는 cmux remote-trigger로 로컬 머신에서 실행 (개인 PC 환경).

## 변경 이력

- 2026-05-16: 초기 작성
