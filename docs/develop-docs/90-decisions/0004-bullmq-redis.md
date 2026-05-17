# ADR-0004: 비동기 렌더링에 BullMQ + Redis 채택

- 상태: Accepted
- 날짜: 2026-05-16

## 컨텍스트

- AI 렌더는 수 초~수십 초 소요. HTTP 동기 응답 불가.
- 사용자에게 진행률 표시 필요.
- 재시도, 멱등성, 부분 결과 보존 필요.

## 결정

**BullMQ + Redis** 큐를 사용한다. Nest API가 잡 enqueue → Worker 컨테이너가 dequeue → SSE로 클라이언트에 진행 상태 푸시.

## 대안

1. **PostgreSQL 큐 (graphile-worker, pg-boss)** — 인프라 컴포넌트 줄지만 BullMQ 대비 동시성/지연 처리 약함.
2. **AWS SQS / GCP Tasks** — 클라우드 종속. MVP 단계 부적합.
3. **인메모리 큐** — 워커 재시작 시 잡 손실, 분산 불가.
4. **BullMQ** — Node 생태계 표준, 재시도/타임아웃/우선순위 기본 제공, 멱등성 jobId. **채택**.

## 결과

**긍정**:

- 재시도·백오프·멱등성 키 기본 제공.
- Worker 수평 확장 용이.
- BullBoard로 큐 상태 시각화 가능.

**부정**:

- Redis 컨테이너 추가 운영.
- Redis 영속화 필요(AOF 활성화).

## 관련

- 렌더 파이프라인: [`../30-tech/04-render-pipeline.md`](../30-tech/04-render-pipeline.md)
