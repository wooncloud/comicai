# 02. Backend (NestJS API)

`apps/api`의 실제 코드 기준 백엔드 개요. 모든 인용은 `apps/api/src/` 기준 상대경로이며, 외부 패키지는 `packages/` 기준이다.

---

## 1. 부트스트랩

### 1.1 HTTP 엔트리 (`main.ts`)

- `NestFactory.create(AppModule, { bufferLogs: true })` — `main.ts:10`
- 로거를 `nestjs-pino`의 `Logger`로 교체 — `main.ts:11`
- `applyAppPipeline(...)` 호출 시 `HttpMetricsInterceptor`를 extraInterceptor로 주입 — `main.ts:12-14`
- CORS: `origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'`, `credentials: true` — `main.ts:15-18`
- 포트: `process.env.API_PORT ?? 4000` — `main.ts:20-21`

### 1.2 글로벌 파이프라인 (`bootstrap.ts`)

`main.ts`와 통합 테스트가 동일한 미들웨어 체인을 쓰도록 별도 분리되어 있다 — `bootstrap.ts:7-23`.

- `setGlobalPrefix('v1', { exclude: ['healthz'] })` — `bootstrap.ts:15` (즉 `/healthz` 외 모든 라우트는 `/v1/...`)
- `app.use(cookieParser())` — `bootstrap.ts:16`
- 글로벌 파이프: `ZodValidationPipe` — `bootstrap.ts:17`
  - `DTO.zodSchema` 정적 프로퍼티에서 Zod 스키마를 찾아 `safeParse`, 실패 시 `ZodError` throw — `common/zod-validation.pipe.ts:7-13`
- 글로벌 인터셉터: `HttpMetricsInterceptor` → `ResponseEnvelopeInterceptor`
  - `ResponseEnvelopeInterceptor`: 204/SSE를 제외한 모든 성공 응답을 `{ data: ... }`로 감싼다 — `common/response-envelope.interceptor.ts:14-21`
- 글로벌 필터: `AllExceptionsFilter`
  - `ZodError → 400 VALIDATION_ERROR(details.issues)`, `HttpException → 매핑된 code/message`, 그 외 → `500 INTERNAL_ERROR` — `common/all-exceptions.filter.ts:42-97`
  - 상태→코드 매핑은 `STATUS_TO_CODE` 테이블, 코드→한국어 메시지는 `CODE_TO_MESSAGE` 매핑(`common/all-exceptions.filter.ts:20-36`).

### 1.3 워커 엔트리 (`worker.ts`)

- `createApplicationContext`로 HTTP 없이 모듈만 부트 — `worker.ts:10`
- `SIGTERM/SIGINT`에 graceful close — `worker.ts:13-18`
- 워커 프로세스 자체는 BullMQ Worker 인스턴스를 직접 만들지 않는다. `RenderWorker`가 모듈 init에서 환경변수 기반으로 BullMQ Worker를 띄운다(아래 §5 참조).

### 1.4 AppModule (`app.module.ts`)

- `ConfigModule.forRoot({ isGlobal: true })` — `app.module.ts:23`
- `LoggerModule.forRoot(...)`: pino redact 경로(`req.headers.cookie`, `authorization`, `*.apiKey`, `*.secret`, `*.token`, `*.ciphertext`, `*.password`, `*.passwordHash`), `/healthz`는 autoLogging 제외 — `app.module.ts:24-56`
- `ThrottlerModule.forRoot([{ ttl: 60s, limit: 120 }])`, `APP_GUARD = ThrottlerGuard`로 글로벌 적용 — `app.module.ts:57, 72`
- `configure(consumer)`에서 `CsrfMiddleware`를 모든 라우트(`'*'`)에 부착 — `app.module.ts:74-77`
- 등록 모듈: `MetricsModule, EmailModule, AuthModule, OAuthModule, MeModule, ApiKeysModule, ProjectsModule, ConsistencyModule, PagesModule, PanelsModule, RenderModule, ExportModule` — `app.module.ts:58-69`
- 직접 등록 컨트롤러: `HealthController` — `app.module.ts:71`

---

## 2. 인증 모델

### 2.1 세션 쿠키 (`auth/session.service.ts`)

- 저장소: **Redis** (`SessionService`가 `ioredis`로 직접 연결, `REDIS_URL ?? 'redis://localhost:6379'`) — `auth/session.service.ts:29-31`
- TTL: 14일 — `auth/session.service.ts:6`
- 키: `session:{sid}` (페이로드 JSON, EX 갱신), `user_sessions:{userId}` (sid 집합) — `auth/session.service.ts:7-9, 47-51`
- 쿠키 이름: `comicai_sid`, `httpOnly`, `sameSite: 'lax'`, `secure`는 `COOKIE_SECURE` 또는 `NODE_ENV=production`에 의존 — `auth/session.service.ts:126-136`
- `read()`는 hit 시 `lastUsedAt` 갱신 + TTL 연장 — `auth/session.service.ts:55-62`
- 다중 세션 지원: `listForUser`, `destroyAllExcept`, `destroyAllForUser`(비밀번호 변경/리셋 시 호출) — `auth/session.service.ts:77-123`

### 2.2 SessionGuard (`auth/session.guard.ts`)

- 쿠키 없음 → `401 NO_SESSION`, 만료 → `401 SESSION_EXPIRED` — `auth/session.guard.ts:18-21`
- 성공 시 `req.user = { id, email }`, `req.sid` 주입 — `auth/session.guard.ts:22-23`

### 2.3 CSRF (`common/csrf.middleware.ts`)

- Double-submit cookie 패턴 — `common/csrf.middleware.ts:11-44`
- `/healthz`, `/metrics`는 스킵; `GET/HEAD/OPTIONS`는 통과(세션 쿠키 있고 csrf 쿠키 없으면 발급) — `common/csrf.middleware.ts:8-27`
- mutating 요청은 `X-CSRF-Token` 헤더 == `comicai_csrf` 쿠키 일치 필수. 불일치 시 `403 CSRF_INVALID` — `common/csrf.middleware.ts:30-41`
- 토큰 발급: `issueCsrfToken(res, secure)`, 쿠키는 `httpOnly: false`(JS 가독), `sameSite: 'lax'` — `common/csrf.middleware.ts:46-55`

### 2.4 AuthController (`auth/auth.controller.ts`)

모두 `/v1/auth/...`. 글로벌 prefix 적용.

| Method | Route                             | Handler                                 | 비고                                                   |
| ------ | --------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| POST   | `/v1/auth/signup`                 | `signup` (`auth.controller.ts:53-71`)   | argon2 해시, 세션 발급, 검증 메일 발송. Throttle 60s/5 |
| POST   | `/v1/auth/login`                  | `login` (`:73-89`)                      | Throttle 60s/10                                        |
| POST   | `/v1/auth/logout`                 | `logout` (`:91-98`)                     | 세션 destroy + 쿠키 clear                              |
| POST   | `/v1/auth/verify-email/request`   | `requestEmailVerification` (`:100-115`) | 비로그인은 조용히 통과                                 |
| POST   | `/v1/auth/verify-email/:token`    | `verifyEmail` (`:117-125`)              | `emailVerifiedAt` 세팅                                 |
| POST   | `/v1/auth/password-reset/request` | (`:127-138`)                            | 사용자 존재 누설 금지                                  |
| POST   | `/v1/auth/password-reset/confirm` | (`:140-149`)                            | 변경 후 모든 세션 destroy                              |

토큰 발급/소비는 `AuthTokensService`: token은 `urlSafeToken()` 평문 반환, DB에는 `sha256Hex` 해시 저장 — `auth/auth-tokens.service.ts:28-39`. 만료: verify 24h, reset 30m — `:5-6`.

### 2.5 OAuth (`auth/oauth/*`)

- 지원 provider: `google`, `github` — `auth/oauth/oauth.providers.ts:138-141`
- 활성화 조건: `${PROVIDER}_OAUTH_CLIENT_ID` + `_CLIENT_SECRET` env 둘 다 존재 — `auth/oauth/oauth.service.ts:95-101`
- state는 Redis에 `oauth_state:{state}`로 10분 TTL — `auth/oauth/oauth.service.ts:14-15, 41-46`
- 콜백 URI: `${API_PUBLIC_URL ?? 'http://localhost:${API_PORT}'}/v1/auth/oauth/${provider}/callback` — `auth/oauth/oauth.service.ts:103-108`
- 라우트:
  - GET `/v1/auth/oauth/:provider` → 302 authorize URL — `oauth.controller.ts:18-27`
  - GET `/v1/auth/oauth/:provider/callback` → 세션 발급 + CSRF 발급 후 `${WEB_ORIGIN}${returnTo || '/projects'}`로 302 — `oauth.controller.ts:29-64`
- 사용자 매칭: 이메일 기준 link-or-create. `oauthProviders` JSON 배열에 provider 추가, `emailVerified`면 `emailVerifiedAt` 채움 — `auth/oauth/oauth.service.ts:110-148`

---

## 3. 도메인 모듈 맵

모든 mutating 라우트는 `SessionGuard` 보호. 라우트는 글로벌 prefix `/v1` 포함.

### 3.1 MeModule (`me/me.controller.ts`)

| Method | Route                  | Handler                                                            |
| ------ | ---------------------- | ------------------------------------------------------------------ |
| GET    | `/v1/me`               | `me` (`me.controller.ts:69-76`)                                    |
| PATCH  | `/v1/me`               | `patch` (`:78-89`) — displayName/avatarUrl                         |
| PATCH  | `/v1/me/password`      | `changePassword` (`:91-109`) — argon2 검증, 현재 세션 외 모두 종료 |
| GET    | `/v1/me/sessions`      | `listSessions` (`:111-122`)                                        |
| DELETE | `/v1/me/sessions/:sid` | `revokeSession` (`:124-130`)                                       |

### 3.2 ApiKeysModule (`api-keys/api-keys.controller.ts`)

BYOK(Bring Your Own Key) 저장소. provider: `gemini | openai`.

| Method | Route                     | Handler                                 |
| ------ | ------------------------- | --------------------------------------- |
| GET    | `/v1/api-keys`            | `list` (`api-keys.controller.ts:28-31`) |
| POST   | `/v1/api-keys`            | `create` (`:33-37`)                     |
| POST   | `/v1/api-keys/:id/verify` | `verify` (`:39-42`)                     |
| DELETE | `/v1/api-keys/:id`        | `remove` (`:44-48`)                     |

- 키 평문은 AES-256-GCM 봉인: `MASTER_KEY`(base64 32B) + 랜덤 nonce 12B + authTag 16B 이어붙임 — `api-keys/crypto.ts:1-40`
- `ApiKeyBreaker` (Redis): 1시간 윈도우 내 동일 키 5회 auth 실패 시 `isActive=false`로 비활성화 — `api-keys/api-keys.breaker.ts:7-47`
- `ApiKeysService.verify`: provider별 verify 호출 → 성공 시 `lastVerifiedAt`/`isActive` 갱신, auth 실패 시 비활성화 — `api-keys/api-keys.service.ts:66-93`

### 3.3 ProjectsModule (`projects/projects.controller.ts`)

| Method | Route              | Handler                                   |
| ------ | ------------------ | ----------------------------------------- |
| GET    | `/v1/projects`     | `list` (`projects.controller.ts:32-35`)   |
| POST   | `/v1/projects`     | `create` (`:37-41`)                       |
| GET    | `/v1/projects/:id` | `detail` (`:43-46`) — pages id/order 포함 |
| PATCH  | `/v1/projects/:id` | `patch` (`:48-51`)                        |
| DELETE | `/v1/projects/:id` | `remove` (`:53-57`)                       |

소유권 체크: `assertOwned` (`projects/projects.service.ts:62-66`).

### 3.4 ConsistencyModule (`consistency/consistency.controller.ts`)

타입: `style | character | background | worldview` (`@comicai/types`).

| Method | Route                                 | Handler                                                                             |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/v1/projects/:pid/consistency?type=` | `list` (`consistency.controller.ts:47-51`)                                          |
| POST   | `/v1/projects/:pid/consistency`       | `create` (`:53-57`)                                                                 |
| PATCH  | `/v1/consistency/:id`                 | `patch` (`:59-62`)                                                                  |
| DELETE | `/v1/consistency/:id`                 | `remove` (`:64-68`)                                                                 |
| POST   | `/v1/consistency/:id/images`          | `uploadImages` (`:74-89`) — multipart `files`, 최대 12개, 파일당 `MAX_UPLOAD_BYTES` |

### 3.5 PagesModule (`pages/pages.controller.ts`)

| Method | Route                     | Handler                              |
| ------ | ------------------------- | ------------------------------------ |
| GET    | `/v1/projects/:pid/pages` | `list` (`pages.controller.ts:33-36`) |
| POST   | `/v1/projects/:pid/pages` | `create` (`:38-42`)                  |
| GET    | `/v1/pages/:id`           | `get` (`:44-47`)                     |
| PATCH  | `/v1/pages/:id`           | `patch` (`:49-52`)                   |
| DELETE | `/v1/pages/:id`           | `remove` (`:54-58`)                  |

### 3.6 PanelsModule (`panels/panels.controller.ts`)

| Method | Route                      | Handler                                                    |
| ------ | -------------------------- | ---------------------------------------------------------- |
| GET    | `/v1/pages/:pageid/panels` | `list` (`panels.controller.ts:37-40`)                      |
| POST   | `/v1/pages/:pageid/panels` | `create` (`:42-46`)                                        |
| PATCH  | `/v1/panels/:id`           | `patch` (`:48-51`)                                         |
| DELETE | `/v1/panels/:id`           | `remove` (`:53-57`)                                        |
| GET    | `/v1/panels/:id/history`   | `history` (`:59-62`)                                       |
| POST   | `/v1/panels/:id/upload`    | `upload` (`:64-72`) — multipart `file`, `MAX_UPLOAD_BYTES` |

업로드는 `FileInterceptor`로 메모리 버퍼 수신 → `PanelsService.appendUpload` → `StorageService.storeUploadedImage`(검증+썸네일+패널 refImages append).

리스트 응답은 currentRender의 presign URL을 동봉 — `panels/panels.service.ts:55-80`.

### 3.7 RenderModule (`render/*`)

RenderModule import: `AuthModule, PanelsModule, StorageModule, ApiKeysModule` — `render/render.module.ts:12-13`.

| Method | Route                         | Handler                                               |
| ------ | ----------------------------- | ----------------------------------------------------- |
| POST   | `/v1/panels/:id/render`       | `start` → 202 — `render/render.controller.ts:25-29`   |
| GET    | `/v1/render-jobs/:id`         | `get` (`:31-34`)                                      |
| POST   | `/v1/render-jobs/:id/cancel`  | `cancel` 204 (`:36-40`)                               |
| POST   | `/v1/render-jobs/:id/restore` | `restore` (`:42-45`) — Panel.currentRenderId 되돌리기 |
| GET    | `/v1/render-jobs/:id/events`  | SSE (`:47-60`) — `@SkipThrottle`                      |

SSE 응답은 `Content-Type: text/event-stream`. `Last-Event-ID` 헤더로 재구독 시 누락 분 재전송, 30초마다 ping — `render.controller.ts:51-59`.

### 3.8 ExportModule (`export/export.controller.ts`)

| Method | Route                  | Handler                                 |
| ------ | ---------------------- | --------------------------------------- |
| POST   | `/v1/pages/:id/export` | `export` — `export.controller.ts:17-20` |

`sharp`로 캔버스(페이지 size, alpha)를 만들고, 각 패널의 `currentRender` 결과를 패널 shape 마스크(SVG)로 잘라 `composite` — `export/export.service.ts:55-90`. dpi는 `withMetadata({ density: dpi })`(기본 150)로 박힌다. 결과는 S3에 `exports/{userId}/{pageId}/{ulid}.{ext}` 키로 업로드 후 presign URL 반환 — `:94-110`.

### 3.9 HealthController / MetricsController

- `GET /healthz` (글로벌 prefix 제외, `@SkipThrottle`) — `health/health.controller.ts:7-11`
- `GET /v1/metrics` (`@SkipThrottle`) — `metrics/metrics.controller.ts:11-15`
- Prometheus 메트릭: `http_requests_total`, `http_request_duration_seconds`, `render_attempts_total{model,outcome}`, `render_duration_seconds{model}` + `comicai_` 프리픽스의 default metrics — `metrics/metrics.service.ts:15-46`

### 3.10 EmailModule

- `@Global()` 모듈. `ConsoleEmailProvider`가 기본(프로덕션에서 경고 로그) — `email/email.module.ts:4-21`
- `EmailService.sendVerification / sendPasswordReset`는 `${WEB_ORIGIN}/verify-email/{token}` 또는 `${WEB_ORIGIN}/reset-password?token=...`로 링크 구성 — `email/email.provider.ts:37-53`

---

## 4. 영속 계층 (Prisma)

`packages/db/prisma/schema.prisma`, Postgres.

핵심 모델 (`schema.prisma`):

- **User** (`:12-30`) — `email` unique, `passwordHash?`, `displayName?`, `avatarUrl?`, `oauthProviders Json`(배열), `emailVerifiedAt?`.
- **EmailVerification** (`:32-44`), **PasswordReset** (`:46-58`) — `tokenHash` unique, `expiresAt`, `usedAt`.
- **ApiKey** (`:60-75`) — `provider`, `label`, `ciphertext`, `nonce`, `lastVerifiedAt`, `isActive`. AES-GCM 봉인분.
- **Project** (`:77-91`) — userId, name, thumbnail.
- **ConsistencyEntity** (`:93-109`) — `type` 문자열(`style|character|background|worldview`), `aliases String[]`, `description`, `refImages Json`, `version Int`.
- **Page** (`:111-125`) — `order`, `size Json` ({w,h}), `background Json?`.
- **Panel** (`:127-141`) — `shape Json`(rect/polygon 등), `conti Json?`, `text Json`(TipTapDoc), `refImages Json`, `currentRenderId?`, `history String[]`.
- **RenderJob** (`:143-161`) — `panelId`, `userId`, `model`, `ir Json`(`RenderIR`), `status`(`queued|running|succeeded|failed|timeout|canceled`), `resultImage Json?`(`ImageRef`), `error Json?`, `attempts Int`.

Prisma 클라이언트는 `@comicai/db`로 재노출되어 컨트롤러/서비스에서 직접 `prisma.X`를 import한다 (예: `panels.service.ts:2`, `auth.controller.ts:14`).

---

## 5. 백그라운드 작업 (BullMQ + Redis)

### 5.1 큐 (`render/render.queue.ts`)

- 큐 이름: `render` (`RENDER_QUEUE_NAME` = `:7`)
- 연결: `parseRedis(REDIS_URL)` (`:47-54`)
- `RenderQueue`는 `Queue<RenderJobData>`와 `QueueEvents`를 모두 보유 — `:24-27`
- `enqueue`: `jobId = idempotencyKey(ir, userId, model)` = `'job_' + sha256(ir+userId+model).slice(0,32)` — `:34-44, 56-58`. `attempts: 3`, `exponential backoff 2s`, `removeOnComplete.age 86400`, `removeOnFail: false`.

### 5.2 워커 (`render/render.worker.ts`)

- 모듈 init에서 `RENDER_WORKER_DISABLED === '1'`이면 워커를 만들지 않음(즉 API 프로세스에서 워커 분리 가능) — `:29-40`
- concurrency: `RENDER_CONCURRENCY ?? 2` — `:38`
- 모델 호출 데드라인 60s (`AbortController`) — `:15, 67-68`
- 처리 흐름 (`:46-125`):
  1. `RenderJob` 행 로드, 취소 상태면 skip
  2. status → `running`, `attempts++`, SSE publish
  3. `getAdapter(model)` (packages/adapters)로 어댑터 획득
  4. `resolveApiKey(userId, model)`: `mock` → 빈 키, 그 외 provider(`gemini` prefix → 'gemini', else 'openai')의 활성 키 1건을 `apiKey` 테이블에서 가장 최근 것으로 → `open()`으로 복호 — `:127-139`
  5. `adapter.buildRequest(ir, apiKey)` → `adapter.call(req, signal, ctx)` 호출. `ctx.loadReference`는 `StorageService.getBytes` 위임 — `:69`
  6. 결과 바이트를 `StorageService.putImage({ kind: 'render', renderJobId })`로 저장하고 `RenderJob.resultImage` 갱신, SSE `status: succeeded` publish
  7. 실패는 `adapter.classifyError(err)`로 분류(`auth|quota|safety|invalid|transient|timeout`). `retryLimitFor`(transient 3 / timeout 2 / 그 외 1)에 따라 재시도 — `:106-108, 146-150`
  8. 최종 실패면 status → `timeout` 또는 `failed`, error 저장, SSE `error` + `status` publish
- auth 실패는 `ApiKeyBreaker.recordAuthFailure(apiKeyId)`로 회로 카운터 증가 — `:101-104`
- 성공 시 `breaker.recordSuccess` 호출 — `:97`
- Prometheus: `renderDuration.startTimer({ model })` + `renderAttemptsTotal.inc({ model, outcome })` — `:71, 123`

### 5.3 SSE 허브 (`render/sse.hub.ts`)

- 채널 이름: `render:events:{jobId}` — `:20-21`
- 역할 분리(`:46-69`):
  - `RENDER_WORKER_DISABLED === '1'` (API 전용 프로세스) → Redis **subscriber**만 만든다(`psubscribe('render:events:*')`).
  - 그 외(워커 또는 단일 프로세스) → **publisher**만 만든다.
- `publish(jobId, evt)`: in-memory `deliver` 먼저 fan-out → publisher가 있으면 Redis로 envelope(`{originId, evt}`) 발행. `originId === instanceId` 메시지는 self-echo로 차단 — `:55-69, 95-101`
- 버퍼 한도 64, terminal status(`succeeded|failed|timeout|canceled`)는 5분 retention 후 cleanup — `:17-19, 125-135`
- `Last-Event-ID` 기반 시퀀스 재전송 (seq 카운터는 `counters` 맵) — `:76-93, 108-123`
- `ping`은 항상 local-only (Redis 라운드트립 회피) — `:104-106`
- `SSE_HUB_DISABLED === '1'`이면 Redis 연결 자체를 만들지 않음 — `:47`

### 5.4 IR 빌더 (`render/ir.builder.ts`)

- Panel + Project 컨텍스트에서 `RenderIR`을 합성 — `:20-74`
- TipTap 멘션 노드에서 `consistencyEntity.id`를 추출(`resolveMentionIds`), DB 조회 후 텍스트에 이름 치환(`serializeTextWithNameReplacement`) — `:33-39`
- entity type별로 `styles | characters | backgrounds | worldviews` 페이로드 분리 — `:46-58`
- `aspectRatio`와 `panelSize`는 패널 shape의 bounding box로 계산 — `:60-89`

---

## 6. 스토리지 (`storage/storage.service.ts`)

- AWS SDK v3 `S3Client` + `forcePathStyle: true` (MinIO 호환) — `:49`
- 두 개의 클라이언트 보유: 내부 endpoint(`S3_ENDPOINT`)와 presign 전용(`S3_PUBLIC_ENDPOINT`) — `:28-55`. 외부(브라우저)에서 SigV4 host 검증을 통과시키기 위함.
- 환경 변수: `S3_ENDPOINT(=http://localhost:9000)`, `S3_PUBLIC_ENDPOINT`, `S3_REGION(=us-east-1)`, `S3_BUCKET(=comicai)`, `S3_ACCESS_KEY(=minioadmin)`, `S3_SECRET_KEY(=minioadmin)` — `:41-48`
- 부팅 시 `HeadBucketCommand` → 없으면 `CreateBucketCommand` (`STORAGE_AUTO_CREATE_BUCKET=0`이면 skip) — `:56-71`
- presign TTL: 15분 — `:23`
- 키 스킴 (`buildKey`, `:166-181`):
  - `projects/_/renders/{renderJobId}.{ext}` — render 결과
  - `projects/{projectId}/refs/{entityId}/{ulid}.{ext}` — consistency 참조 이미지
  - `projects/{projectId}/panels/{panelId}/upload/{ulid}.{ext}` — 패널 업로드
  - `projects/{projectId}/panels/{panelId}/conti/{ulid}.{ext}` — 콘티 스케치
  - `exports/{userId}/{pageId}/{ulid}.{ext}` — 페이지 내보내기
- 업로드는 `validateAndNormalizeImage`(`storage/image-validator.ts`)로 검증 후 sharp로 256×256 webp 썸네일 자동 생성 — `:106-121`
- `presignIfSucceeded`: render status가 `succeeded`일 때만 presign URL 반환 — `:131-137`
- `getBytes`는 어댑터 컨텍스트(`loadReference`)와 export 합성에서 사용 — `:139-152`

---

## 7. 외부 모델 어댑터 연계

- 패키지: `packages/adapters` — `index.ts:24-34`에 `REGISTRY` 정의.
  - `mock` → `MockAdapter`
  - `gemini-3.1-flash-image-preview` → `GeminiAdapter`
  - `gpt-image-2` → `OpenAIAdapter`
- 인터페이스 `ModelAdapter` — `packages/adapters/src/index.ts:8-13`:
  - `buildRequest(ir, apiKey)` → unknown
  - `call(req, signal, ctx)` → `Promise<AdapterImage>`
  - `classifyError(err)` → `RenderError { category, ... }`
- `AdapterContext.loadReference`는 워커가 `StorageService.getBytes`로 주입 — `apps/api/src/render/render.worker.ts:69`
- API → adapters 호출 경로는 오직 `RenderWorker.process`뿐 (`render.worker.ts:73-77`). 컨트롤러는 큐에 enqueue만 한다.
- BYOK 키 선택 규칙: 모델 ID가 `gemini`로 시작하면 provider=`gemini`, 그 외 `openai` — `render.worker.ts:131-134`. 키가 없으면 `RenderApiKeyMissing`(category=`auth`)로 throw하여 즉시 실패 처리(retry limit 1).

---

## 8. 환경 변수 요약

| 키                                                                                                   | 위치                                                                                                            | 기본/비고                            |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `API_PORT`                                                                                           | `main.ts:20`                                                                                                    | `4000`                               |
| `WEB_ORIGIN`                                                                                         | `main.ts:16`, `oauth.controller.ts:39`, `email.provider.ts:34`                                                  | `http://localhost:3000`              |
| `API_PUBLIC_URL`                                                                                     | `oauth.service.ts:104`                                                                                          | OAuth callback base                  |
| `REDIS_URL`                                                                                          | `session.service.ts:30`, `oauth.service.ts:27`, `render.queue.ts:23`, `sse.hub.ts:48`, `api-keys.breaker.ts:23` | `redis://localhost:6379`             |
| `DATABASE_URL`                                                                                       | `schema.prisma:9`                                                                                               | Postgres                             |
| `S3_ENDPOINT` / `S3_PUBLIC_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `storage.service.ts:41-48`                                                                                      | MinIO 기본값                         |
| `STORAGE_AUTO_CREATE_BUCKET`                                                                         | `storage.service.ts:56`                                                                                         | `'0'`이면 자동 생성 skip             |
| `MASTER_KEY`                                                                                         | `api-keys/crypto.ts:8-14`                                                                                       | base64 32B, BYOK AES-GCM 봉인 키     |
| `COOKIE_SECURE`                                                                                      | `session.service.ts:129-132`                                                                                    | secure 쿠키 토글                     |
| `RENDER_WORKER_DISABLED`                                                                             | `render.worker.ts:30`, `sse.hub.ts:49`                                                                          | `'1'`이면 API 프로세스에서 워커 분리 |
| `RENDER_CONCURRENCY`                                                                                 | `render.worker.ts:38`                                                                                           | 기본 2                               |
| `SSE_HUB_DISABLED`                                                                                   | `sse.hub.ts:47`                                                                                                 | 테스트용                             |
| `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, `GITHUB_OAUTH_CLIENT_ID`/`_SECRET`                               | `oauth.service.ts:96-99`                                                                                        | 둘 다 있어야 provider 활성           |
| `LOG_LEVEL`, `NODE_ENV`                                                                              | `app.module.ts:26-33`                                                                                           | pino 레벨/포맷                       |

---

## 9. 그 외 공통 유틸

- `common/tokens.ts` — `urlSafeToken`, `hexToken`, `sha256Hex`
- `common/upload.ts` — `requireUploadedFile` (multer 파일 가드)
- `common/bbox.ts` — 패널 shape bounding box 계산
- `storage/image-validator.ts` — 업로드 이미지 MIME/사이즈/픽셀 검증 + sharp 정규화 (`MAX_UPLOAD_BYTES` export)
- `metrics/metrics.interceptor.ts` — HTTP 메트릭 인터셉터(이미 `applyAppPipeline`을 통해 등록됨)
