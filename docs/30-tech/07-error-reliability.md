# 에러 / 신뢰성

> v0.1 — 2026-05-16 — Draft

## 에러 카테고리

| 카테고리 | 예시 | 재시도 | UX |
|---|---|---|---|
| `transient` | HTTP 5xx, 네트워크 단절, rate-limit | O (지수 백오프 3회) | "재시도 중" |
| `auth` | 401/403, 무효 키 | X | "API 키 확인" + 키 설정 링크 |
| `quota` | 결제·한도 초과 | X | "API 한도 초과" |
| `safety` | 콘텐츠 정책 위반 | X | "프롬프트가 정책 위반" |
| `invalid` | 이미지 너무 큼/포맷 X | X | 사전 검증으로 차단 |
| `timeout` | 응답 없음 | O (1회) | "응답 지연, 재시도" |

## 재시도 정책

- BullMQ `attempts: 3`, `backoff: exponential(2000ms)` → 2s, 4s, 8s.
- 재시도 가능한 카테고리: `transient`, `timeout`만.
- 다른 카테고리는 즉시 FAILED 처리.

## 멱등성

- `jobId = sha256({irHash, userId, model}).slice(0, 32)`.
- 같은 키로 짧은 시간 내 재제출 → BullMQ가 기존 잡 반환.
- 사용자 더블 클릭/네트워크 재시도로 인한 중복 호출 방지.

## 회로 차단 (Circuit Breaker)

- 사용자 단위: 같은 API 키로 5회 연속 `auth` 에러 → 키 `isActive=false`로 자동 비활성화. 사용자에게 알림.
- 시스템 단위: 특정 모델 전체에서 1분 내 50건 이상 `transient` → 해당 모델 일시 차단 (5분).

## 부분 결과 보존

- 패널별 독립 잡 → 일부 실패해도 다른 패널 영향 없음.
- 패널 1개의 잡 실패: 이전 성공 결과는 히스토리에 그대로 남음. 현재 상태만 FAILED.
- 에러 응답 raw는 `render_jobs.error.rawResponse` (JSONB)에 보관 → 사용자가 "자세히" 클릭 시 표시.

## 클라이언트 SSE 끊김 처리

- 클라이언트는 `EventSource` 사용 → 자동 재연결.
- 서버는 `Last-Event-ID`로 누락분 재전송.
- 끊김 동안의 최종 상태는 `GET /v1/render-jobs/:id`로 폴링 fallback.

## 로깅 / 마스킹

- 절대 로그에 출현 금지: API 키 원문, 비밀번호.
- 모든 로그 미들웨어에 마스킹 처리(`/sk-[a-zA-Z0-9_-]{20,}/` 등).
- CI에 `grep -rE 'sk-[A-Za-z0-9]{20,}' logs/` 검증.

## 메트릭

- `render_jobs_total{model,status}` — Prometheus counter.
- `render_duration_seconds{model}` — histogram.
- `render_errors_total{model,category}` — counter.

## 변경 이력
- 2026-05-16: 초기 작성
