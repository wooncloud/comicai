# 렌더링 파이프라인

> v0.1 — 2026-05-16 — Draft

## RenderIR (모델 독립 중간 표현)

```ts
type RenderIR = {
  panelId: string;
  projectId: string;

  styles: StylePayload[];
  characters: CharacterPayload[];
  backgrounds: BackgroundPayload[];
  worldviews: WorldviewPayload[];

  contiSketch?: ImageRef;
  userImages: ImageRef[];
  userPrompt: string;        // 멘션이 이름으로 치환된 본문

  aspectRatio: string;       // "4:3", "16:9" ...
  panelSize: { w: number; h: number };
  seed?: number;
};

type CharacterPayload = {
  entityId: string;
  entityVersion: number;
  name: string;
  description: string;
  images: ImageRef[];
};
// Background, Style, Worldview 도 유사 구조 (Style/Worldview는 일부 필드 생략 가능)
```

## 상태 머신

```
       enqueue
QUEUED ────────▶ RUNNING ─── success ───▶ SUCCEEDED
                    │
                    ├── transient err ──▶ (재시도) RUNNING
                    │     ↑                  │
                    │     └── attempts < 3 ──┘
                    │
                    ├── auth/quota/safety/invalid ──▶ FAILED
                    ├── timeout ──▶ TIMEOUT (1회 재시도 후 FAILED)
                    └── user cancel ──▶ CANCELED
```

## 타임아웃 계층

| 계층 | 타임아웃 | 도구 |
|---|---|---|
| 모델 API 호출 | 60s | `AbortController` |
| BullMQ 잡 전체 | 120s | `timeout` 옵션 |
| 클라이언트 SSE | 180s+ | 서버보다 길게 |

## BullMQ 설정

```ts
const queue = new Queue('render', { connection: redis });

await queue.add('render', payload, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  timeout: 120_000,
  removeOnComplete: { age: 86400 },
  removeOnFail: false,
  jobId: idempotencyKey(payload), // 멱등성
});
```

## 워커 의사 코드

```ts
processor('render', async (job) => {
  const { irId, model, apiKeyId, userId } = job.data;
  const ir = await db.renderJob.findById(irId).ir;
  const apiKey = await crypto.decrypt(apiKeyId);
  const adapter = adapters[model];

  await db.update(irId, { status: 'running' });
  emitSSE(userId, irId, { status: 'running', attempts: job.attemptsMade });

  try {
    const req = adapter.buildRequest(ir, apiKey);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 60_000);
    const image = await adapter.call(req, abort.signal);
    clearTimeout(timer);

    const stored = await storage.put(image);
    await db.update(irId, {
      status: 'succeeded',
      resultImage: stored,
      finishedAt: new Date(),
    });
    emitSSE(userId, irId, { status: 'succeeded', resultImage: stored });
  } catch (err) {
    const classified = adapter.classifyError(err);
    const isRetryable = classified.category === 'transient' || classified.category === 'timeout';
    if (isRetryable && job.attemptsMade < 3) throw err; // BullMQ가 재시도
    await db.update(irId, { status: 'failed', error: classified, finishedAt: new Date() });
    emitSSE(userId, irId, { status: 'failed', error: classified });
  }
});
```

## 멱등성

```
idempotencyKey = sha256(JSON.stringify({
  irHash: hash(ir),
  userId,
  model,
})).slice(0, 32)
```

같은 키로 짧은 시간 내 재제출 시 기존 잡 반환. BullMQ의 `jobId`를 키로 사용.

## SSE 채널 설계

- 엔드포인트: `GET /v1/render-jobs/:id/events`
- 이벤트 타입: `status`, `error`, `ping`
- 30s마다 keep-alive `ping`.
- 클라이언트는 `Last-Event-ID` 헤더로 재연결 시 누락분 받음.

## 변경 이력
- 2026-05-16: 초기 작성
