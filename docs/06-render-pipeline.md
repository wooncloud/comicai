# 06 · 렌더 파이프라인 (End-to-End)

패널 인스펙터의 "생성하기" 버튼부터 결과 이미지가 캔버스에 반영되기까지의 흐름.
파일은 모두 절대경로(`/Users/wooncloud/project/comicai` 기준)와 라인을 함께 표기한다.

---

## 1. 전체 시퀀스

```
[UI Button click]
   └─▶ POST /panels/:id/render            (apps/web/components/editor/panel-inspector.tsx:222 → :87)
        └─▶ RenderController.start        (apps/api/src/render/render.controller.ts:25)
             └─▶ RenderService.startRender(apps/api/src/render/render.service.ts:17)
                  ├─ buildRenderIR        (apps/api/src/render/ir.builder.ts:21)
                  ├─ prisma.renderJob.create  status='queued'      (render.service.ts:38)
                  ├─ RenderQueue.enqueue  (BullMQ)                 (render.service.ts:48 → render.queue.ts:34)
                  └─ panel.currentRenderId/history 갱신            (render.service.ts:50)
              ⇢ { jobId }                                          (controller: HTTP 202)

[BullMQ worker]
   └─▶ RenderWorker.process               (apps/api/src/render/render.worker.ts:46)
        ├─ status='running'  + SseHub.publish('status', running)   (render.worker.ts:52,56)
        ├─ getAdapter(model) → buildRequest → call                 (render.worker.ts:63,74,75)
        ├─ storage.putImage(MinIO/S3)                              (render.worker.ts:76 → storage.service.ts:73)
        ├─ prisma.renderJob.update status='succeeded'+resultImage  (render.worker.ts:83)
        └─ SseHub.publish('status', succeeded, resultImage)        (render.worker.ts:91)

[Browser EventSource]
   └─ es.addEventListener('status', …)    (panel-inspector.tsx:118)
        └─ next === 'succeeded' →
            GET /render-jobs/:id          (panel-inspector.tsx:125 → controller :31 → service :57)
              └─ presignIfSucceeded       (storage.service.ts:131)
            patchRender({ currentRenderStatus, currentRenderImageUrl })  (panel-inspector.tsx:128)
```

HTTP 응답 코드는 컨트롤러에서 `@HttpCode(202)`로 고정되어 있다
(`apps/api/src/render/render.controller.ts:26`).

---

## 2. 단계별 상세

### 2.1 UI 트리거 — `startRender` mutation

- 버튼: `apps/web/components/editor/panel-inspector.tsx:222`
  - `onClick={() => startRender.mutate()}` — `status`가 `queued`/`running`이면 비활성.
- mutation 정의: `panel-inspector.tsx:87`
  - `POST ApiPaths.panelRender(panel.id)` (`/panels/:id/render`)
  - body: `{ model }` — Gemini/OpenAI ModelId.
  - `onSuccess({ jobId })`: jobId를 상태로 두고 `subscribeJob`을 호출
    (`panel-inspector.tsx:96-106`).
- 라우트 정의: `packages/types/src/paths.ts:35` (`panelRender`).

### 2.2 API 컨트롤러 — 큐 등록

- `apps/api/src/render/render.controller.ts:25-29`
  ```ts
  @Post('panels/:id/render')
  @HttpCode(202)
  start(req, id, body) { return this.svc.startRender(...); }
  ```
- 인증: `SessionGuard` 클래스 레벨 적용 (`render.controller.ts:17`).
- DTO 검증: `RenderStartSchema` (zod, `render.controller.ts:11`).

`RenderService.startRender` (`apps/api/src/render/render.service.ts:17`):

1. `panels.assertOwned` — 소유권 확인 (`:23`).
2. `buildRenderIR(panel.id, seed)` — 텍스트/콘티/참조이미지를 IR로 직렬화. 그림체는
   `panel.styleId ?? project.defaultStyleId`를 `effectiveStyleId`로 자동 주입하며 멘션 대상이 아님
   (`apps/api/src/render/ir.builder.ts:21, 34-36, 61-63`).
3. 입력 검증 — 본문/콘티/참조 중 하나도 없으면
   `BadRequestException({ code: 'RENDER_INVALID_INPUT' })` (`:25-30`).
4. **Idempotency key** = `sha256({ ir, userId, model }).slice(0,32)` →
   `'job_' + …` (`render.queue.ts:56-58`). 동일 입력은 기존 jobId 반환 (`:33-36`).
5. `prisma.renderJob.create({ status: 'queued', ir })` (`:38-47`).
6. `RenderQueue.enqueue` — BullMQ `Queue.add('render', data, { jobId, attempts:3, backoff: exponential(2000) })`
   (`render.queue.ts:36-42`).
7. `panel.currentRenderId`와 `history.push(jobId)` 동시 갱신 (`:50-53`).

### 2.3 Worker — 어댑터 호출 & 저장

`apps/api/src/render/render.worker.ts`

- 부팅: `onModuleInit` (`:29`)에서 BullMQ `Worker`를 생성.
  - `RENDER_WORKER_DISABLED=1`이면 미생성 (API 전용 프로세스 분리, `:30`).
  - `concurrency`: `RENDER_CONCURRENCY` env(기본 2) — `:37`.
- 처리 함수 `process(data, attemptsMade)` (`:46`):
  1. `prisma.renderJob.findUnique` — 취소/삭제 확인 (`:48-50`).
  2. `status='running'`로 업데이트 + `attempts` 증가 (`:52-55`).
  3. `SseHub.publish({ type:'status', status:'running' })` (`:56-61`).
  4. `getAdapter(model)` — `packages/adapters/src/index.ts:30` 디스패치
     (`gemini-*` → GeminiAdapter, `gpt-image-*` → OpenAIAdapter, `mock` → MockAdapter).
  5. `resolveApiKey(userId, model)` — DB의 활성 API 키를 가져와 `crypto.open`으로 복호화
     (`:127-139`). 키 없음 → `RenderApiKeyMissing`(category=`auth`, `:142`).
  6. `AbortController` + `setTimeout(MODEL_CALL_TIMEOUT_MS = 60_000)` — 어댑터 호출 데드라인 (`:67-68, 15`).
  7. `adapter.buildRequest(ir, apiKey)` → `adapter.call(req, signal, ctx)` (`:74-75`).
  8. 성공:
     - `storage.putImage({kind:'render', renderJobId}, bytes, mime, w, h)` →
       MinIO/S3 PUT, ImageRef 반환 (`apps/api/src/storage/storage.service.ts:73-94`).
     - `prisma.renderJob.update({ status:'succeeded', resultImage, finishedAt })` (`render.worker.ts:83-90`).
     - `SseHub.publish({ type:'status', status:'succeeded', resultImage })` (`:91-96`).
     - `breaker.recordSuccess(apiKeyId)` — 회로차단기 카운터 리셋 (`:97`).
  9. 예외:
     - `adapter.classifyError(err)` → `RenderError` (category: `transient|auth|quota|safety|invalid|timeout`)
       (`render.worker.ts:100`, 타입 `packages/types/src/index.ts:211-217`).
     - `auth`면 `ApiKeyBreaker.recordAuthFailure` (`:102-104`).
     - 재시도 한도(`retryLimitFor`)에 못 미치면 `throw err` → BullMQ가 backoff로 재시도
       (`:106-108, 146-150`): transient=3, timeout=2, 그 외=1(즉시 실패).
     - 한도 도달 시 `status` = `timeout` 또는 `failed`로 fix, `error` 컬럼에 분류 결과 저장
       (`:109-117`).
     - `SseHub.publish({ type:'error', error })` + `{ type:'status', status }` 두 번 발행
       (`:118-119`).
  10. `finally`: timer/metric 정리 (`:120-124`).

### 2.4 SSE 허브 — 실시간 fan-out

`apps/api/src/render/sse.hub.ts`

- 채널: Redis pub/sub `render:events:<jobId>` (`:20-21`).
- 역할 분리 (`:46-69`):
  - API 프로세스(`RENDER_WORKER_DISABLED=1`): **subscriber만** psubscribe.
  - Worker(또는 단일 프로세스): **publisher만**.
  - `originId`로 자기 echo 차단 (`:58`).
- `subscribe(jobId, res, lastEventId)` (`:76`):
  - 컨트롤러에서 `Last-Event-ID` 헤더를 읽어 (`render.controller.ts:55-57`) 버퍼에 남아있는
    이벤트 중 seq > lastEventId인 것만 재전송 (`sse.hub.ts:83-88`).
- `publish(jobId, evt)` (`:95`): 즉시 in-memory `deliver` + (publisher 있으면) Redis pub.
- `ping(jobId)` (`:104`): local-only heartbeat. 컨트롤러가 30초마다 발사 (`render.controller.ts:58`).
- 종결 상태(`succeeded|failed|timeout|canceled`)는 5분 후 버퍼 자동 정리 (`:18-19, 120-135`).

SSE wire format은 `packages/events/src/index.ts:25` `formatSseEvent`:
`event: status` / `id: <seq>` / `data: <json>` / 빈 줄 2개.

이벤트 타입은 `RenderSseEvent = RenderStatusEvent | RenderErrorEvent | RenderPingEvent`
(`packages/events/src/index.ts:22`).

### 2.5 브라우저 수신

`apps/web/components/editor/panel-inspector.tsx:112-155`

- `new EventSource(`${API_BASE}${ApiPaths.renderJobEvents(jobId)}`, { withCredentials: true })`.
- `'status'` 리스너 (`:118`):
  - React Query 캐시 `['render-job', jobId]`에 status 즉시 반영 (`:121`).
  - `succeeded` → `GET /render-jobs/:id`로 최종 DTO(presigned URL 포함) 재요청 →
    `patchRender({ currentRenderStatus:'succeeded', currentRenderImageUrl })` →
    `panel-history` invalidate → EventSource close (`:124-137`).
  - `failed`/`canceled` → 토스트 + invalidate + close (`:138-144`).
  - 그 외(`queued`/`running`/`timeout`) → status만 반영 (`:144-146`).
- `'error'` 리스너 (`:149`): payload의 `error.message`를 인스펙터 상단 배너에 표시.

---

## 3. `RenderStatus` 상태 머신

타입 정의: `packages/types/src/index.ts:13-23, 182`.

```
                     ┌──────────┐
   POST /render  ──▶ │  queued  │
                     └────┬─────┘
                          │  worker가 pick up
                          ▼
                     ┌──────────┐
                     │ running  │ ──┐ adapter 호출 (deadline 60s)
                     └────┬─────┘   │
        성공             │           │  실패 분류
            putImage+DB ▼           ▼
                     ┌──────────┐  ┌─────────────────────┐
                     │succeeded │  │ failed   (auth/quota│
                     └──────────┘  │          /safety/   │
                                   │          invalid/   │
                                   │          transient↑) │
                                   ├─────────────────────┤
                                   │ timeout  (deadline) │
                                   ├─────────────────────┤
                                   │ canceled (POST      │
                                   │          /cancel)   │
                                   └─────────────────────┘
```

- **In-progress**: `['queued','running']` (`IN_PROGRESS_RENDER_STATUSES`, `:22`).
- **Terminal**: `['succeeded','failed','timeout','canceled']` (`TERMINAL_RENDER_STATUSES`, `:23`).
- transient 카테고리는 BullMQ가 attempts<3까지 재시도하므로 client 입장에서는 `running` 유지.
- `succeeded`만 `restoreRender`가 허용된다(아래 §4).

---

## 4. 히스토리 & 복원

### 4.1 GET `/panels/:id/history`

- 라우트: `apps/api/src/panels/panels.controller.ts:59-62`.
- 서비스: `apps/api/src/panels/panels.service.ts:149-176`
  - 해당 패널의 최근 RenderJob 20개(`orderBy createdAt desc`)를 가져와 각각 `resultImage` 키를
    `presignDownload`로 URL화한 `RenderJobDTO[]` 반환.
- 클라이언트: `apps/web/components/editor/history-tray.tsx:15-18`에서 useQuery로 그리드 표시.

### 4.2 POST `/render-jobs/:id/restore`

- 라우트: `apps/api/src/render/render.controller.ts:42-45` →
  `PanelsService.restoreRender` 위임.
- 동작: `panels.service.ts:178-198`
  1. `prisma.renderJob.findUnique` — 소유자 확인.
  2. `job.status !== 'succeeded'` → `ForbiddenException({ code:'CONFLICT' })`
     ("성공한 렌더만 복원할 수 있습니다", `:186-191`).
  3. `prisma.panel.update({ currentRenderId: job.id })` — **history 배열은 변경 없음**, 단지 포인터만 교체.
  4. 갱신된 `PanelDTO`를 반환 (presigned URL 포함).
- 클라이언트: `history-tray.tsx:20-27` — 성공 시 `onRestored(panel)` 콜백으로 부모(panel-inspector)에
  새 PanelDTO를 흘려보낸다. `panel-inspector.tsx:54-56`의 useEffect가 `panel.currentRenderId` 변경을
  감지해 `activeJobId`를 동기화하여 인스펙터 미리보기가 즉시 교체된다.

요약: 복원은 **새 RenderJob을 만들지 않고** `panel.currentRenderId` 포인터만 과거 jobId로 되돌린다.

---

## 5. 취소

### 5.1 엔드포인트

- `POST /render-jobs/:id/cancel` — `apps/api/src/render/render.controller.ts:36-40`,
  `@HttpCode(204)`.
- 서비스 `RenderService.cancel` (`render.service.ts:79-94`):
  - 소유자 확인.
  - `status in (succeeded|failed)`이면 `BadRequestException({ code:'CONFLICT' })`.
  - 그 외(`queued`/`running`/`timeout`/`canceled`)는 DB row를 `status='canceled', finishedAt=now`로 강제 갱신.

### 5.2 워커 측 동작

- **실행 중 abort는 없다.** Worker는 `process` 진입 시 한 번 `row.status === 'canceled'`를 확인하고
  그렇다면 즉시 return 한다 (`render.worker.ts:49-50`). 이미 `running`에 들어간 어댑터 호출은
  완료(또는 60s deadline)까지 진행되며, 결과 DB write는 `status='canceled'` row를 덮어쓸 수 있다.
- 외부 AbortController는 `MODEL_CALL_TIMEOUT_MS`(60s) 만료에만 트리거된다 (`render.worker.ts:67-68`).
- SSE 측은 컨트롤러가 명시적으로 `canceled` 이벤트를 보내지는 않는다 — UI는 다음번 `getJob` 폴링/페이지
  복귀 시 `canceled` 상태를 관찰하거나, worker가 종료 시 publish하는 status 이벤트로 알게 된다.

UI에서 취소 버튼은 현재 panel-inspector에 노출되어 있지 않다 (mutation 없음).
경로 헬퍼 `ApiPaths.renderJobCancel`는 정의되어 있으나(`packages/types/src/paths.ts:42`)
프론트엔드 호출 지점은 없다.

---

## 6. 에러 봉투 (Failure modes → UI)

### 6.1 분류 (`RenderError`)

`packages/types/src/index.ts:211-217`:

```ts
type RenderErrorCategory = 'transient' | 'auth' | 'quota' | 'safety' | 'invalid' | 'timeout';
interface RenderError {
  category;
  message;
  rawResponse?;
}
```

분류는 각 어댑터의 `classifyError`가 결정한다 (`packages/adapters/src/gemini.ts`, `openai.ts`).

### 6.2 재시도 & 종결 매핑

`render.worker.ts:146-150` `retryLimitFor`:

| category  | retry limit | 최종 status       |
| --------- | ----------- | ----------------- |
| transient | 3           | 도달 시 `failed`  |
| timeout   | 2           | 도달 시 `timeout` |
| auth      | 1 (즉시)    | `failed`          |
| quota     | 1 (즉시)    | `failed`          |
| safety    | 1 (즉시)    | `failed`          |
| invalid   | 1 (즉시)    | `failed`          |

`auth` 카테고리는 추가로 `ApiKeyBreaker.recordAuthFailure`로 회로차단기 카운터를 누적시킨다
(`render.worker.ts:102-104`).

### 6.3 전파 경로

1. **워커 → SSE**: `{ type:'error', error: RenderError }`(`render.worker.ts:118`) +
   `{ type:'status', status:'failed'|'timeout' }` (`:119`).
2. **DB**: `RenderJob.error` JSON 컬럼에 `RenderError` 저장 (`:110-115`).
3. **GET /render-jobs/:id 응답**: `RenderJobDTO.error`로 노출 (`render.service.ts:72`).
4. **UI**:
   - `panel-inspector.tsx:149-154` `'error'` 이벤트 리스너가 `setError(payload.error.message)`로
     배너 표시 (`:201-205`).
   - `'status'` 이벤트의 terminal 도달 시 토스트:
     `failed` → "렌더 실패", `canceled` → "렌더 취소됨" (`:138-141`).
   - PanelStatusBadge가 색상으로 상태 시각화.

### 6.4 컨트롤러 단의 동기 에러

- `RENDER_INVALID_INPUT` (`render.service.ts:26`) — 본문/콘티/참조 비어있음. HTTP 400.
- `RESOURCE_NOT_FOUND` (`render.service.ts:60, 85; panels.service.ts:184`).
- `CONFLICT` — 이미 종결된 작업 cancel 시도(`render.service.ts:88`),
  성공 아닌 잡 restore 시도(`panels.service.ts:188`).
- `PANEL_NOT_FOUND`/`RESOURCE_FORBIDDEN` — `panels.service.ts:213-215`.

API key 미존재(`RenderApiKeyMissing`)는 worker 컨텍스트에서만 발생하며 `category:'auth'`로 분류되어
위 경로를 거쳐 SSE로 전달된다.

---

## 6.5 말풍선과의 관계

말풍선(SpeechBubble)은 **렌더 파이프라인에 영향을 주지 않는다**. `buildRenderIR`(`apps/api/src/render/ir.builder.ts`)는 SpeechBubble을 읽지 않으며, 모델에는 패널 본문 텍스트와 일관성 엔티티만 전달된다. 말풍선은 export 단계(`apps/api/src/export/export.service.ts`)에서 SVG로 직렬화되어 최종 페이지 이미지 위에 오버레이된다 — `speech-bubble.render.ts:renderSpeechBubbleSvg`.

---

## 7. 빠른 참조 인덱스

| 관심사                                           | 위치                                                      |
| ------------------------------------------------ | --------------------------------------------------------- |
| 버튼 onClick                                     | `apps/web/components/editor/panel-inspector.tsx:222`      |
| startRender mutation                             | `apps/web/components/editor/panel-inspector.tsx:87`       |
| EventSource subscribe                            | `apps/web/components/editor/panel-inspector.tsx:112`      |
| API 경로 헬퍼                                    | `packages/types/src/paths.ts:35-45`                       |
| 컨트롤러 (POST render/get/cancel/restore/events) | `apps/api/src/render/render.controller.ts:25,31,36,42,47` |
| `RenderService.startRender`                      | `apps/api/src/render/render.service.ts:17`                |
| `RenderService.getJob`                           | `apps/api/src/render/render.service.ts:57`                |
| `RenderService.cancel`                           | `apps/api/src/render/render.service.ts:79`                |
| BullMQ enqueue & idempotency                     | `apps/api/src/render/render.queue.ts:34,56`               |
| Worker process loop                              | `apps/api/src/render/render.worker.ts:46`                 |
| Adapter 디스패치                                 | `packages/adapters/src/index.ts:30`                       |
| 스토리지 업로드                                  | `apps/api/src/storage/storage.service.ts:73`              |
| presign                                          | `apps/api/src/storage/storage.service.ts:123,131`         |
| SSE Hub publish/subscribe                        | `apps/api/src/render/sse.hub.ts:95,76`                    |
| SSE wire 포맷                                    | `packages/events/src/index.ts:25`                         |
| RenderStatus enum                                | `packages/types/src/index.ts:13`                          |
| RenderError 타입                                 | `packages/types/src/index.ts:211`                         |
| 패널 히스토리 (list/restore)                     | `apps/api/src/panels/panels.service.ts:149,178`           |
| 히스토리 UI                                      | `apps/web/components/editor/history-tray.tsx:15,20`       |
