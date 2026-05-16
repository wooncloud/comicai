# 관측성

> v0.1 — 2026-05-16 — Draft

## 로깅

- 구조화 로그(JSON), `pino` 사용.
- 필수 필드: `time`, `level`, `service`, `requestId`, `userId`(있을 때), `event`.
- 마스킹 미들웨어: API 키 패턴(`sk-...`, `AIza...` 등) 자동 치환.

```ts
logger.info({ event: 'render.enqueue', jobId, model }, 'render queued');
```

## 메트릭 (Prometheus)

| 메트릭 | 타입 | 라벨 |
|---|---|---|
| `http_requests_total` | counter | method, route, status |
| `render_jobs_total` | counter | model, status |
| `render_duration_seconds` | histogram | model |
| `render_errors_total` | counter | model, category |
| `queue_depth` | gauge | queue |

엔드포인트: `/metrics` (인증 게이트).

## 트레이싱 (Post-MVP)
- OpenTelemetry. MVP에선 도입 보류.

## 알림
- MVP: 없음 (1인 개발, 본인 cmux notification으로 충분).
- 사업화 후: Sentry + Slack webhook.

## 대시보드
- MVP: Prometheus 단독. 필요 시 Grafana 도입.

## 변경 이력
- 2026-05-16: 초기 작성
