# 04. 공유 패키지 (packages/\*)

ComicAI 모노레포의 `packages/` 디렉토리에는 4개의 공유 워크스페이스 패키지가 있다. 모두 `@comicai/*` 네임스페이스, `private: true`, `main: ./dist/index.js`, `types: ./dist/index.d.ts` 형태로 빌드 산출물을 노출한다. exports 필드는 사용하지 않고 `main`/`types`만 노출하는 단순 구조다.

| 패키지              | 역할                                       | 주 의존성                |
| ------------------- | ------------------------------------------ | ------------------------ |
| `@comicai/types`    | API 계약(DTO/스키마/경로/에러)             | `zod`                    |
| `@comicai/db`       | Prisma 클라이언트 + ID 헬퍼                | `@prisma/client`, `ulid` |
| `@comicai/events`   | SSE wire-format, mention 직렬화            | `@comicai/types`         |
| `@comicai/adapters` | 모델 어댑터 레지스트리(Gemini/OpenAI/Mock) | `@comicai/types`         |

소비처 import 카운트 (`apps/` 트리 기준): types 78회, db 15회, events 3회, adapters 1회. types는 사실상 web/api 양쪽에서 공통 계약 역할을 하고, db/events/adapters는 API 서버 전용이다.

---

## 1) @comicai/types

API 계약의 단일 진실 소스. 변경 시 owner: A-Backend(`packages/types/src/index.ts:1`).

### 공개 파일 구성

- `src/index.ts` — 도메인 DTO, enum, helper. 다른 모듈 re-export.
- `src/envelope.ts` — `ApiEnvelope<T>`, `ErrorCode` 열거.
- `src/paths.ts` — API 경로 상수와 CSRF 쿠키/헤더 이름.
- `src/schemas.ts` — zod 스키마(백엔드 validation + 프런트 폼 검증 공유).
- `src/panel-path.ts` — 패널 모양 SVG path 생성(프런트 clip + 백엔드 알파 마스크 공유).

### 모델/렌더 enum

- `ModelProvider = 'gemini' | 'openai' | 'mock'` (`src/index.ts:7`).
- `ModelId = 'gemini-3.1-flash-image-preview' | 'gpt-image-2' | 'mock'` (`src/index.ts:8`).
- `RENDER_STATUSES = ['queued','running','succeeded','failed','timeout','canceled']` (`src/index.ts:13-20`).
- `IN_PROGRESS_RENDER_STATUSES`, `TERMINAL_RENDER_STATUSES`, `isInProgressRender()` 헬퍼 (`src/index.ts:22-27`).
- `PANEL_SHAPE_TYPES = ['rect','rounded','oval','diamond','parallelogram','polygon']` (`src/index.ts:95-103`). 인스펙터 picker용 `PANEL_SHAPE_PRESETS`는 polygon 제외(`src/index.ts:106-107`).
- `RenderErrorCategory = 'transient'|'auth'|'quota'|'safety'|'invalid'|'timeout'` (`src/index.ts:211`).
- `EntityType = 'style'|'character'|'background'|'worldview'` (`src/index.ts:72`).
- `OAUTH_PROVIDERS = ['google','github']` (`src/index.ts:10`).

### DTO

| DTO                                                                      | 위치                   | 주요 필드                                                                                                                                                            |
| ------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectDTO`                                                             | `src/index.ts:176-188` | `id, userId, name, thumbnail?(storageKey), thumbnailUrl?(presigned, 페이지 background 폴백), defaultStyleId?(대표 그림체 엔티티 id), createdAt, updatedAt`           |
| `PageDTO`                                                                | `src/index.ts:157-168` | `id, projectId, order, name(null이면 'p{order+1}'), size{w,h}, background?, backgroundUrl?(presigned)`                                                               |
| `PanelDTO`                                                               | `src/index.ts:118-133` | `id, pageId, shape, conti?, text(TipTapDoc), refImages, currentRenderId?, currentRenderStatus?, currentRenderImageUrl?, styleId?(패널별 그림체 override), history[]` |
| `PanelShape`                                                             | `src/index.ts:111-116` | `type, points[], strokeColor, strokeWidth`                                                                                                                           |
| `ConsistencyEntityDTO`                                                   | `src/index.ts:74-87`   | `type, name, aliases[], description, refImages[], refImageUrls[](presigned), version`                                                                                |
| `RenderJobDTO`                                                           | `src/index.ts:250-263` | `id, panelId, userId, model, status, resultImage?, resultImageUrl?(presigned), error?, attempts, finishedAt?`                                                        |
| `RenderIR`                                                               | `src/index.ts:235-248` | 워커에 전달되는 입력 IR: `styles/characters/backgrounds/worldviews`, `contiSketch?, userImages, userPrompt, aspectRatio, panelSize, seed?`                           |
| `RenderError`                                                            | `src/index.ts:213-217` | `category, message, rawResponse?`                                                                                                                                    |
| `ImageRef`                                                               | `src/index.ts:56-61`   | `storageKey, width, height, mimeType` — 모든 저장된 이미지 참조의 표준형                                                                                             |
| `AdapterImage`                                                           | `src/index.ts:64-69`   | 모델 응답 raw 이미지(워커가 업로드)                                                                                                                                  |
| `SessionInfo` / `SessionUser` / `ApiKeySummary`                          | `src/index.ts:29-53`   | 인증 관련                                                                                                                                                            |
| `TipTapDoc` / `TipTapNode` / `TipTapMentionAttrs`                        | `src/index.ts:134-152` | 패널 본문(mention 노드 포함). `emptyDoc()` 헬퍼 제공                                                                                                                 |
| `BoundingBox`, `shapeBoundingBox()`, `pointsBoundingBox()`               | `src/index.ts:184-209` | polygon 등 좌표 헬퍼                                                                                                                                                 |
| `StylePayload / CharacterPayload / BackgroundPayload / WorldviewPayload` | `src/index.ts:219-233` | `RenderIR` 컴포넌트                                                                                                                                                  |

### 에러 봉투 (envelope.ts)

성공: `{ data: T }`, 실패: `{ error: { code, message, details? } }` (`src/envelope.ts:48-60`).

`ErrorCode` 카테고리(`src/envelope.ts:4-46`):

- 공통: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `BAD_REQUEST`, `RATE_LIMITED`, `INTERNAL_ERROR`, `CSRF_INVALID`.
- 인증: `NO_SESSION`, `SESSION_EXPIRED`, `SESSION_NOT_FOUND`, `INVALID_CREDENTIALS`, `INVALID_PASSWORD`, `EMAIL_TAKEN`, `EMAIL_NOT_VERIFIED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `OAUTH_PROVIDER_DISABLED`, `OAUTH_PROVIDER_ERROR`, `OAUTH_STATE_INVALID`, `PASSWORD_REQUIRED`.
- 도메인: `RESOURCE_NOT_FOUND`, `RESOURCE_FORBIDDEN`, `PROJECT_NOT_FOUND`, `PANEL_NOT_FOUND`, `PAGE_NOT_FOUND`, `API_KEY_NOT_FOUND`, `API_KEY_VERIFY_FAILED`, `CONSISTENCY_NOT_FOUND`.
- 렌더: `RENDER_QUOTA_EXCEEDED`, `RENDER_INVALID_INPUT`, `RENDER_SAFETY_BLOCK`, `RENDER_AUTH_FAILED`, `RENDER_TIMEOUT`.
- 업로드: `UPLOAD_TYPE_NOT_ALLOWED`, `UPLOAD_TOO_LARGE`, `UPLOAD_DIMENSIONS_INVALID`.

타입 가드: `isApiFailure(env)` (`src/envelope.ts:62-64`).

### API 경로 (paths.ts)

- `API_PREFIX = '/v1'`, `CSRF_COOKIE_NAME = 'comicai_csrf'`, `CSRF_HEADER_NAME = 'x-csrf-token'` (`src/paths.ts:2-4`).
- `ApiPaths` 객체 — 정적 문자열 + 함수형 path builder(`src/paths.ts:6-46`). 양 앱 모두 이 상수를 import해 경로를 동기화한다.
  - auth: `signup`, `login`, `logout`, `oauthRedirect(p)`, `oauthCallback(p)`, `verifyEmailRequest`, `verifyEmail(token)`, `passwordResetRequest`, `passwordResetConfirm`.
  - me: `me`, `mePassword`, `meSessions`, `meSession(sid)`.
  - api keys: `apiKeys`, `apiKey(id)`, `apiKeyVerify(id)`.
  - projects: `projects`, `project(id)`, `projectPages(pid)`, `projectConsistency(pid)`.
  - pages: `page(id)`, `pageExport(id)`, `pagePanels(id)`.
  - panels: `panel(id)`, `panelUpload(id)`, `panelRender(id)`, `panelHistory(id)`.
  - consistency: `consistency(id)`, `consistencyImages(id)`.
  - render: `renderJob(id)`, `renderJobCancel(id)`, `renderJobEvents(id)`, `renderJobRestore(id)`.

### Zod 스키마 (schemas.ts)

백엔드 컨트롤러와 프런트엔드 폼이 동일 스키마를 import해 검증을 공유한다.

- 비밀번호 정책 상수: `PASSWORD_MIN_LENGTH=10`, `PASSWORD_MAX_LENGTH=200`, `PASSWORD_PATTERN`(영문+숫자 10자+) (`src/schemas.ts:7-14`).
- 인증: `CredentialsSchema`, `PasswordResetRequestSchema`, `PasswordResetConfirmSchema`, `PasswordChangeSchema` (`src/schemas.ts:16-35`).
- 프로필: `MePatchSchema` (`src/schemas.ts:39-43`).
- API 키: `ApiKeyCreateSchema` — provider는 `gemini`/`openai`만, key는 8~500자 (`src/schemas.ts:47-52`).
- 프로젝트: `ProjectCreateSchema`, `ProjectPatchSchema` (`src/schemas.ts:55-61`).
- 페이지: `PageSizeSchema`(기본 800×1200), `PageCreateSchema`, `PagePatchSchema` (`src/schemas.ts:88-93`).
- 렌더: `RenderModelSchema`(ModelId enum과 동일), `RenderStartSchema` (`src/schemas.ts:103-106`).
- 내보내기: `ExportFormatSchema = 'png'|'jpg'`, `ExportRequestSchema`(dpi 72~600, 기본 150) (`src/schemas.ts:111-115`).
- 패널: `PanelShapeSchema` — points 3~64개, strokeColor 기본 `#000000`, strokeWidth 기본 2 (`src/schemas.ts:119-124`).
- 일관성: `EntityTypeSchema`, `ConsistencyCreateSchema`, `ConsistencyPatchSchema` (`src/schemas.ts:141-145`).

### Panel path 헬퍼 (panel-path.ts)

- `PANEL_ROUND_RADIUS = 14` (`src/panel-path.ts:10`).
- `DIAMOND_POINTS`, `PARALLELOGRAM_POINTS` 정규화 vertex (`src/panel-path.ts:12-24`).
- `panelShapePath(type, w, h, polygonPoints?)` — `rect/rounded/oval/diamond/parallelogram/polygon` 각각에 대한 SVG `d` 문자열을 (0,0)~(w,h) 좌표계로 생성 (`src/panel-path.ts:30-55`). 프런트는 캔버스 clip-path, 백엔드는 export 알파 마스크에 동일 함수를 사용해 좌표 분기 방지.

### 주 소비처

- `apps/web/*`: DTO 타입, `ApiPaths`, zod 스키마(React Hook Form), `emptyDoc()`, `pageLabel()`, panel-path 헬퍼.
- `apps/api/*`: 동일 DTO/스키마를 NestJS DTO/pipe에서 재사용(78회 import의 대부분).

---

## 2) @comicai/db

Prisma 기반 ORM 래퍼. 글로벌 싱글톤 클라이언트 + ID 발급 헬퍼.

### 공개 export

`src/index.ts:1-19`:

- `prisma` — globalThis-cached PrismaClient (dev 환경에서 hot reload 누수 방지).
- `export * from '@prisma/client'` — Prisma 생성 타입을 그대로 re-export.
- `export * from './ids'` — `newId(prefix)`, `entityIdPrefix(type)`, `IdPrefix` 타입.

### ID 컨벤션 (`src/ids.ts:1-32`)

- `newId(prefix)`가 `'{prefix}_{ulid()}'` 형식으로 ID 생성. ULID는 시간 정렬 가능 + URL safe.
- `IdPrefix` 목록: `user`, `apikey`, `proj`, `page`, `panel`, `render`, `char`, `bg`, `style`, `world`, `evf`(email verification), `prt`(password reset token).
- `entityIdPrefix(type)`로 `EntityType`(`style/character/background/worldview`)을 ID prefix(`style/char/bg/world`)로 매핑.

### ORM 및 DB

- ORM: Prisma 5.20.0 (`package.json:16`).
- DB: PostgreSQL (`prisma/schema.prisma:8`), `DATABASE_URL` 환경변수.
- 스크립트: `prisma generate`, `prisma migrate dev/deploy`, `prisma studio` (`package.json:8-13`).

### 스키마 엔티티 (`prisma/schema.prisma`)

| 모델                | 매핑 테이블            | 주요 필드                                                                                                       | 관계                                                              |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `User`              | `users`                | `id, email(unique), passwordHash?, displayName?, avatarUrl?, oauthProviders(Json), emailVerifiedAt?` (`:12-30`) | apiKeys, projects, renderJobs, emailVerifications, passwordResets |
| `EmailVerification` | `email_verifications`  | `tokenHash(unique), expiresAt, usedAt?` (`:32-44`)                                                              | userId → User cascade                                             |
| `PasswordReset`     | `password_resets`      | `tokenHash(unique), expiresAt, usedAt?` (`:46-58`)                                                              | userId → User cascade                                             |
| `ApiKey`            | `api_keys`             | `provider, label, ciphertext, nonce, lastVerifiedAt?, isActive` (`:60-75`)                                      | userId → User cascade. AES envelope encryption                    |
| `Project`           | `projects`             | `name, thumbnail?` (`:77-91`)                                                                                   | pages, entities                                                   |
| `ConsistencyEntity` | `consistency_entities` | `type(str), name, aliases[], description, refImages(Json), version` (`:93-109`)                                 | projectId → Project cascade, `@@index([projectId, type])`         |
| `Page`              | `pages`                | `order, name?, size(Json), background(Json?)` (`:111-125`)                                                      | panels, `@@index([projectId, order])`                             |
| `Panel`             | `panels`               | `shape(Json), conti(Json?), text(Json), refImages(Json), currentRenderId?, history[]` (`:127-141`)              | pageId → Page cascade                                             |
| `RenderJob`         | `render_jobs`          | `model, ir(Json), status, resultImage(Json?), error(Json?), attempts, finishedAt?` (`:143-161`)                 | userId → User cascade, `@@index([panelId, createdAt])`            |

JSON 컬럼들은 `@comicai/types`의 `PanelShape`, `ImageRef`, `TipTapDoc`, `RenderIR`, `RenderError` 등을 그대로 직렬화해 저장한다.

### 마이그레이션

`packages/db/prisma/migrations/`:

- `20260516034008_init`
- `20260516085126_p1_user_oauth_profile`
- `20260516100128_p3_auth_tokens`
- `20260516141839_p7_page_name`
- `20260517005900_p7_rename_model_ids` (gemini-3.1-flash-image-preview / gpt-image-2로 ID 갱신)

`migration_lock.toml`로 PostgreSQL provider 고정.

### 주 소비처

`apps/api/src/{auth,projects,panels,pages,render,api-keys,consistency,me,export}/*.service.ts`에서 `prisma`와 `newId()`를 import. 웹 앱은 사용하지 않음(서버 전용 패키지).

---

## 3) @comicai/events

SSE wire format과 cross-process pub/sub 봉투, mention 직렬화 헬퍼.

### SSE 이벤트 타입 (`src/index.ts:3-22`)

`RenderSseEvent = RenderStatusEvent | RenderErrorEvent | RenderPingEvent`:

```ts
RenderStatusEvent { type: 'status', jobId, status: RenderStatus, attempts?, resultImage?: ImageRef }
RenderErrorEvent  { type: 'error',  jobId, error: RenderError }
RenderPingEvent   { type: 'ping',   at: string }
```

### Wire format (`src/index.ts:25-32`)

`formatSseEvent(evt, id?)` — `event: <type>\nid: <id>\ndata: <json>\n\n` 형식 문자열 반환. `id`가 있으면 Last-Event-ID 복구 가능.

### Pub/Sub 봉투 (`src/index.ts:35-46`)

`RenderPubSubEnvelope = { originId: string, evt: RenderSseEvent }`. 다중 인스턴스 간 Redis pub/sub로 이벤트 전파 시 자기 자신이 발행한 이벤트의 echo를 originId로 차단.

- `encodePubSubEnvelope(envelope)` / `decodePubSubEnvelope(raw)` 헬퍼.

### Mention 헬퍼 (`src/mention.ts`)

- `resolveMentionIds(doc: TipTapDoc): string[]` — 본문 내 mention 노드의 entity id를 순서 유지·중복 제거해 반환 (`:4-14`).
- `serializeTextWithNameReplacement(doc, nameById)` — mention을 현재 엔티티 name으로 치환해 평문화. `deleted` 플래그가 있으면 `[삭제됨]`으로 마킹 (`:20-34`).

### 큐 이벤트 이름

`@comicai/events`에는 **큐 이벤트 이름 상수가 없다**. BullMQ 큐 관련 상수는 API 앱 내부(`apps/api/src/render/render.queue.ts`)에 정의:

- `RENDER_QUEUE_NAME = 'render'` (`render.queue.ts:7`).
- 작업 이름: `queue.add('render', data, ...)` (`render.queue.ts:36`).
- `QueueEvents`(BullMQ)도 같은 `'render'` 이름으로 인스턴스화 (`render.queue.ts:26`).

즉, `@comicai/events` 패키지는 BullMQ 큐 이름이 아니라 클라이언트 SSE wire-protocol과 SSE 백엔드 간 pub/sub 봉투에 한정된다.

### 주 소비처

`apps/api/src/render/sse.hub.ts`, `apps/api/src/render/ir.builder.ts`에서 import. 웹 앱은 SSE를 EventSource로 직접 파싱하며 이 패키지 타입을 import하지 않음(현재 검색 기준).

---

## 4) @comicai/adapters

이미지 생성 모델 어댑터 레지스트리. 워커가 `RenderIR` → 모델 호출 → `AdapterImage` 파이프라인을 수행할 때 사용.

### 공통 인터페이스 (`src/index.ts:3-13`)

```ts
interface AdapterContext {
  loadReference(storageKey): Promise<{ bytes: Uint8Array; mimeType: string }>;
}

interface ModelAdapter {
  id: ModelId;
  buildRequest(ir: RenderIR, apiKey: string): unknown;
  call(req: unknown, signal: AbortSignal, ctx: AdapterContext): Promise<AdapterImage>;
  classifyError(err: unknown): RenderError;
}
```

3단계 분리 구조:

1. `buildRequest` — 순수 함수. IR + apiKey를 모델 고유 요청 객체로. 참조 이미지는 placeholder(`__storageKey`)로 보관.
2. `call` — 실제 HTTP 호출 단계. `ctx.loadReference`로 placeholder를 실제 바이트로 치환, AbortSignal로 데드라인 강제.
3. `classifyError` — 모델별 raw error를 표준 `RenderError` 카테고리로 정규화.

### 레지스트리 (`src/index.ts:24-38`)

```ts
const REGISTRY: Record<ModelId, ModelAdapter> = {
  mock: MockAdapter,
  'gemini-3.1-flash-image-preview': GeminiAdapter,
  'gpt-image-2': OpenAIAdapter,
};
getAdapter(model): ModelAdapter
availableModels(): ModelId[]
```

### Reference 우선순위 (`src/priority.ts:7-23`)

`selectReferences(ir, maxImages)` — 어댑터 상한에 맞춰 우선순위 잘림:
`style > character > background > contiSketch > userImages`.

### GeminiAdapter (`src/gemini.ts`)

- 모델 ID: `gemini-3.1-flash-image-preview` (`:5`).
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent` (`:6`).
- `MAX_REF_IMAGES = 16` (`:7`).
- 요청 구조: `{ url, headers: { 'x-goog-api-key': apiKey }, body: { contents: [{role:'user', parts: GeminiPart[]}], generationConfig: { responseModalities: ['IMAGE','TEXT'], imageConfig: { aspectRatio } } } }` (`:16-26`, `:57-69`).
- 프롬프트 빌드: styles/characters/backgrounds/worldviews를 각각 `[그림체: ...]`, `[캐릭터: ...]` 등 한국어 태그 텍스트 파트로, 그 뒤 reference 이미지 파트(placeholder), 마지막에 일관성 지시 + userPrompt + seed (`:42-55`).
- 응답: `candidates[0].content.parts[*].inlineData{mimeType,data(base64)}`에서 첫 inlineData 추출, `promptFeedback.blockReason`은 `safety`로 분류 (`:101-115`).
- 에러 분류 (`:118-135`): AbortError → `timeout`, `SAFETY:` 접두 → `safety`, 401/403 → `auth`, 429 → `quota`, 5xx → `transient`, 400 → `invalid`, ECONNRESET → `transient`.

### OpenAIAdapter (`src/openai.ts`)

- 모델 ID: `gpt-image-2` (`:7`).
- Endpoints (`:5-6`):
  - 참조 이미지 없음 → `POST /v1/images/generations` (JSON).
  - 참조 이미지 있음 → `POST /v1/images/edits` (multipart, `image[]` 다중 첨부).
- `MAX_REF_IMAGES = 4` (`:8`).
- 요청 구조: `{ apiKey, prompt, size, referenceKeys[] }` (`:10-15`).
- 프롬프트: 라인 단위 한국어 텍스트 직렬화(`그림체 X: ...`, `캐릭터 X: ...`, 등) + 패널 비율 안내 + seed + userPrompt (`:111-123`).
- Aspect → size 매핑(`:125-132`): 정사각 `1024x1024`, 가로 `1536x1024`, 세로 `1024x1536`(gpt-image-2 허용 사이즈).
- 응답: `{ data: [{ b64_json }] }`에서 첫 base64 추출, mimeType은 `image/png` 고정 (`:99-109`).
- 에러 분류 (`:78-97`): AbortError → `timeout`, 401/403 → `auth`, 429 → `quota`, 5xx → `transient`, 400+`content_policy` → `safety`, 400 → `invalid`.

### MockAdapter (`src/mock.ts`)

- 모델 ID: `mock` (`:24`).
- 1×1 검정 PNG(인라인 바이트, `:15-21`)를 `MOCK_RENDER_MS`(기본 2000ms) 후 반환.
- `buildRequest`는 빈 객체. 워커 파이프라인/스토리지 업로드 E2E 테스트용.
- 에러 분류: AbortError → `timeout`, 그 외 → `transient`.

### 공통 입출력 계약

| 필드                       | 의미                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `RenderIR`            | `@comicai/types`에 정의. styles/characters/backgrounds/worldviews + contiSketch + userImages + userPrompt + aspectRatio + panelSize + seed? |
| 입력 `apiKey: string`      | 평문 키(워커가 `ApiKey.ciphertext`를 복호화해 주입)                                                                                         |
| 입력 `signal: AbortSignal` | 워커가 데드라인/취소 강제                                                                                                                   |
| 입력 `ctx: AdapterContext` | `loadReference(storageKey)` 콜백으로 placeholder를 실제 바이트로 치환                                                                       |
| 출력 `AdapterImage`        | `{ bytes, width, height, mimeType }` — width/height는 0일 수 있고 워커가 sharp로 후처리                                                     |
| 에러 출력 `RenderError`    | `{ category, message, rawResponse? }` — UI 노출 및 재시도 정책 분기에 사용                                                                  |

### 주 소비처

`apps/api/src/render/render.worker.ts:5` 한 곳에서만 `import { getAdapter, AdapterContext } from '@comicai/adapters'`로 진입한다. 다른 모든 호출은 BullMQ 워커 컨텍스트 내부로 위임된다.

---

## 의존성 그래프 요약

```
types  ─────── (consumed by) ──── web, api, events, adapters, db(jsonb 값의 형상)
db     ─────── api (only)
events ─────── api (only)            depends on → types
adapters ───── api/render.worker     depends on → types
```

types는 진정한 공유 계약이고, 나머지 셋은 API 서버 전용 인프라 추상이다.
