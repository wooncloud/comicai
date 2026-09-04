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
  - `DTO.zodSchema` 정적 프로퍼티에서 Zod 스키마를 찾아 `safeParse`, 실패 시 `ZodError` throw — `common/zod-validation.pipe.ts:14-40`
  - 전역 파이프라 `@Param('id')` 같은 원시 타입도 지나간다. `PASS_THROUGH` 목록(`:10`)으로 걸러낸다.
  - **이름이 `Dto` 로 끝나는데 `zodSchema` 가 없으면 500 으로 즉시 실패**(`:21-33`). 예전에는 조용히
    통과시켜서, 규약을 잊은 DTO 가 아무 입력이나 받아도 아무도 몰랐다.
- 글로벌 인터셉터: `HttpMetricsInterceptor` → `ResponseEnvelopeInterceptor`
  - `ResponseEnvelopeInterceptor`: 204/SSE를 제외한 모든 성공 응답을 `{ data: ... }`로 감싼다 — `common/response-envelope.interceptor.ts:14-22`
- 글로벌 필터: `AllExceptionsFilter`
  - `ZodError → 400 VALIDATION_ERROR(details.issues)`, `HttpException → 매핑된 code/message`, 그 외 → `500 INTERNAL_ERROR` — `common/all-exceptions.filter.ts:42-97`
  - 상태→코드 매핑은 `STATUS_TO_CODE` 테이블, 코드→한국어 메시지는 `CODE_TO_MESSAGE` 매핑(`common/all-exceptions.filter.ts:20-36`).
    `CODE_TO_MESSAGE` 는 **응답 본문의 `message` 만** 채운다 — 웹은 자기 문구 표를 쓰고 서버
    message 를 읽지 않는다(`apps/web/lib/error-message.ts:85`). 그래도 두는 이유는, 지우면
    그 코드들의 `message` 가 NestJS 기본 영문("Unauthorized")이 되어 응답과 로그가 나빠지기
    때문이다. 화면 문구의 단일 출처는 웹 표 쪽이다.
  - **던지는 코드는 `apiError()` 로 묶인다** (`common/api-error.ts:23`). 예외 인자가 그냥
    객체라 아무 문자열이나 통과하던 것을 막는다 — 자세한 이유는 docs/04-shared-packages.md
    의 `ErrorCode` 절. 예외 클래스는 그대로 쓴다: 상태 코드를 고르는 것은 호출부의 판단이고,
    헬퍼가 대신 정하면 옮기는 과정에서 상태가 바뀔 수 있다.

### 1.3 워커 엔트리 (`worker.ts`)

- `createApplicationContext`로 HTTP 없이 모듈만 부트 — `worker.ts:10`
- `SIGTERM/SIGINT`에 graceful close — `worker.ts:13-18`
- 워커 프로세스 자체는 BullMQ Worker 인스턴스를 직접 만들지 않는다. `RenderWorker`가 모듈 init에서 환경변수 기반으로 BullMQ Worker를 띄운다(아래 §5 참조).

### 1.4 AppModule (`app.module.ts`)

- `ConfigModule.forRoot({ isGlobal: true })` — `app.module.ts:26`
- `LoggerModule.forRoot(...)`: pino redact 경로(`req.headers.cookie`, `authorization`, `*.apiKey`, `*.secret`, `*.token`, `*.ciphertext`, `*.password`, `*.passwordHash`), `/healthz`는 autoLogging 제외 — `app.module.ts:27-59`
- `ThrottlerModule.forRoot([{ ttl: 60s, limit: 120 }])`, `APP_GUARD = ThrottlerGuard`로 글로벌 적용 — `app.module.ts:62, 82`
- `APP_GUARD = SessionGuard` 도 함께 등록 — `app.module.ts:93` (아래 §2.2)
- `configure(consumer)`에서 `CsrfMiddleware`를 모든 라우트(`'*'`)에 부착 — `app.module.ts:81-83`
- 등록 모듈: `MetricsModule, EmailModule, AuthModule, OAuthModule, MeModule, ApiKeysModule, ProjectsModule, ConsistencyModule, PagesModule, PanelsModule, SpeechBubblesModule, PageTextsModule, PageLinesModule, RenderModule, ExportModule` — `app.module.ts:61-75`
- 직접 등록 컨트롤러: `HealthController` — `app.module.ts:77`

---

## 2. 인증 모델

### 2.1 세션 쿠키 (`auth/session.service.ts`)

- 저장소: **Redis** (`SessionService`가 `ioredis`로 직접 연결, `redisUrl(config)`) — `auth/session.service.ts:39`
- TTL: 14일 — `auth/session.service.ts:6`
- 키: `session:{sid}` (페이로드 JSON, EX 갱신), `user_sessions:{userId}` (sid 집합) — `auth/session.service.ts:15-16, 56-60`
- 쿠키 이름: `comicai_sid`, `httpOnly`, `sameSite: 'lax'`, `secure`는 `COOKIE_SECURE` 또는 `NODE_ENV=production`에 의존 — `auth/session.service.ts:163-172`
- `read()` 는 **GET + EXPIRE 를 한 왕복(`multi`)** 으로 처리한다 — `auth/session.service.ts:70`.
  인증된 모든 요청이 지나는 길이라 여기가 곧 요청당 Redis 비용이다. 예전에는 GET 뒤에 세션
  JSON 전체를 재직렬화해 SET 했다: 순차 왕복 2회에 그중 하나는 순수 쓰기였고, 실제로 바뀌는
  값은 `lastUsedAt` 하나뿐이었다.
- `lastUsedAt` 은 **1분 이상 묵었을 때만** 다시 쓴다 (`LAST_USED_REFRESH_MS`, `:14` /
  `shouldRefreshLastUsed`, `:202`). 이 값을 읽는 곳은 `/me/sessions`("로그인된 기기") 화면
  하나뿐이라, 요청마다 갱신하면 그 화면의 초 단위 정확도를 위해 인증된 모든 읽기가 Redis
  쓰기를 유발한다. 값이 깨져 있으면 그때는 쓴다(자가 복구). 규칙은 `session-touch.spec.ts`
  가 고정한다. 대가로 `/me/sessions` 의 "마지막 사용" 이 최대 1분 뒤처진다.
- 다중 세션 지원: `listForUser`, `destroyAllExcept`, `destroyAllForUser`(비밀번호 변경/리셋 시 호출) — `auth/session.service.ts:99-145`

### 2.2 SessionGuard (`auth/session.guard.ts`)

**전역 가드다.** 인증이 opt-out 이고, 공개가 필요한 곳만 `@Public()` (`auth/public.decorator.ts:16`)
로 표시한다 — 현재 4곳(health / metrics / auth / oauth)뿐이다.

예전에는 컨트롤러마다 `@UseGuards(SessionGuard)` 를 붙이는 opt-in 이었다. 그러면 가드를 잊은
새 컨트롤러가 **인증도 CSRF 도 없는 상태**가 된다 — `CsrfMiddleware` 가 "세션 쿠키 없는 요청"
을 통과시키기 때문이다(`csrf.middleware.ts:28`, 가드가 401 로 막아 줄 것을 전제한다).
서로를 전제하는 두 밑단 중 하나가 opt-in 이면, 잊었을 때 둘 다 사라진다. 지금은 잊으면
열리는 게 아니라 잠긴다.

- `@Public()` 이면 즉시 통과(세션도 읽지 않는다 — 공개 경로에서 Redis 왕복을 만들지 않는다) — `auth/session.guard.ts:28`
- 쿠키 없음 → `401 NO_SESSION`, 만료 → `401 SESSION_EXPIRED` — `auth/session.guard.ts:33-35`
- 성공 시 `req.user = { id, email }`, `req.sid` 주입 — `auth/session.guard.ts:36-37`
- 전역 가드가 컨트롤러 가드보다 먼저 돌므로 `AdminGuard` 는 `req.user` 를 그대로 받는다.
  `ApiKeysFeatureGuard` 는 순서가 뒤집혔는데 **그쪽이 더 낫다**: 예전에는 플래그를 먼저 봐서
  비로그인 요청이 꺼짐(404)/켜짐(401)을 구분할 수 있었다. 지금은 비로그인이 무조건 401 이라
  플래그 상태가 로그인한 사용자에게만 보인다.
- 규칙은 `session.guard.spec.ts` 가 고정한다.

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
- 활성화 조건: `${PROVIDER}_OAUTH_CLIENT_ID` + `_CLIENT_SECRET` env 둘 다 존재 — `auth/oauth/oauth.service.ts:116-123`
- state는 Redis에 `oauth_state:{state}`로 10분 TTL — `auth/oauth/oauth.service.ts:14-15, 51-56`.
  **여기에 더해 같은 값을 `comicai_oauth_state` 쿠키로도 심고**(`oauth.controller.ts:40`), 콜백에서
  쿠키와 쿼리 state 가 일치할 때만 진행한다(`oauth.service.ts:76-78`). Redis 만 보면 "발급된 적
  있는 값인가" 만 확인하게 되는데, 그건 **누가** 시작했는지를 묻지 않는다 — 공격자가 자기 계정으로
  동의까지 마친 콜백 URL 을 피해자에게 열게 하면 피해자 브라우저에 공격자 세션이 심긴다(로그인 CSRF)
- 콜백 URI: `${API_PUBLIC_URL ?? 'http://localhost:${API_PORT}'}/v1/auth/oauth/${provider}/callback` — `auth/oauth/oauth.service.ts:124-129`
- 라우트:
  - GET `/v1/auth/oauth/providers` → 켜져 있는 provider 목록 — `oauth.controller.ts:28`.
    웹은 **이 목록에 있는 버튼만 그린다**. 예전에는 환경변수와 무관하게 항상 보여서, 설정하지
    않은 상태로 누르면 API 도메인의 JSON 에러 화면에 떨어졌다. `:provider` 라우트보다 **위에
    있어야 한다** — 아래에 두면 `'providers'` 가 provider 이름으로 잡혀 가려진다.
    `Cache-Control: public, max-age=600`(`oauth.controller.ts:27`): 배포 중 바뀌지 않는 값인데
    캐시가 없으면 익명 방문자의 로그인 화면 하드 로드마다 origin 을 치고, 요청마다 로그 한 줄과
    throttler 카운터를 쓴다
  - GET `/v1/auth/oauth/:provider` → 302 authorize URL — `oauth.controller.ts:32-42`
  - GET `/v1/auth/oauth/:provider/callback` → 세션 발급 + CSRF 발급 후 `${WEB_ORIGIN}${returnTo || '/projects'}`로 302 — `oauth.controller.ts:43-79`
- 사용자 매칭: 이메일 기준 link-or-create. `oauthProviders` JSON 배열에 provider 추가, `emailVerified`면 `emailVerifiedAt` 채움 — `auth/oauth/oauth.service.ts:131-201`.
  제공자 이메일도 소문자로 정규화한다(`oauth.service.ts:137`) — GitHub 은 대소문자를 섞어 주므로
  그대로 쓰면 같은 사람에게 계정이 두 벌 생긴다
- **기존 계정에 붙이려면 제공자가 이메일 소유를 증명해야 한다**(`oauth.service.ts:157`). 예전에는
  이메일이 같기만 하면 그 계정의 세션을 발급했다 — 어떤 제공자에서 남의 이메일을 소유 증명 없이
  등록할 수 있으면 비밀번호를 모르는 채 남의 계정을 가져갈 수 있었다. 신규 생성은 막지 않는다
- **약관 동의는 계정 생성 지점에 기록한다.** `termsAgreedAt`(`oauth.service.ts:201`)은 신규 생성
  경로에만 붙고, 기존 계정 링크 경로(`:161-178`)는 건드리지 않는다. 계정을 만드는 경로는 둘
  뿐이고(`auth.service.ts:13`, `oauth.service.ts:188`) 한쪽에만 붙이면 다른 경로로 만들어진
  계정에 기록이 없어 재동의 대상을 가려낼 수 없다. 소셜 가입에는 체크박스를 놓을 자리가 없어
  (버튼을 누르는 순간 계정이 생긴다) 웹의 `OAuthButtons` 가 버튼 아래 띄우는 "계속하면 …동의하는
  것으로 봅니다" 문구가 이 기록의 근거다

---

## 3. 도메인 모듈 맵

모든 mutating 라우트는 `SessionGuard` 보호. 라우트는 글로벌 prefix `/v1` 포함.

### 3.1 MeModule (`me/me.controller.ts`)

| Method | Route                  | Handler                                                                         |
| ------ | ---------------------- | ------------------------------------------------------------------------------- |
| GET    | `/v1/me`               | `me` (`me.controller.ts:86-93`) — `avatarStorageKey` 있으면 presigned URL 우선  |
| PATCH  | `/v1/me`               | `patch` (`:95-109`) — displayName/avatarUrl. 외부 URL 지정 시 storageKey 비움   |
| POST   | `/v1/me/avatar`        | `uploadAvatar` (`:111-128`) — multipart `file`, `MAX_UPLOAD_BYTES`, 자체 업로드 |
| DELETE | `/v1/me/avatar`        | `deleteAvatar` (`:130-139`) — 스토리지 키 + 외부 URL 모두 null                  |
| PATCH  | `/v1/me/password`      | `changePassword` (`:141-159`) — argon2 검증, 현재 세션 외 모두 종료             |
| GET    | `/v1/me/sessions`      | `listSessions` (`:161-172`)                                                     |
| DELETE | `/v1/me/sessions/:sid` | `revokeSession` (`:174-180`)                                                    |

### 3.2 ApiKeysModule (`api-keys/api-keys.controller.ts`)

BYOK(Bring Your Own Key) 저장소. provider: `gemini | openai`.

> **기능 플래그 뒤에 있다.** `FEATURE_API_KEYS` 가 켜져 있지 않으면 이 컨트롤러의 모든
> 라우트가 404 를 돌려준다(`api-keys.controller.ts:34` 의 `ApiKeysFeatureGuard`).
> 403 이 아니라 404 인 이유는, 403 은 "그 기능이 존재한다" 는 정보를 주기 때문이다.
> 세션 검사(전역 가드)가 **먼저** 돌므로 그 404 는 로그인한 사용자만 본다 — 비로그인은
> 플래그 상태와 무관하게 401 이다.
> 결제 + 사용량 과금으로 방향을 바꾸는 중이라 기본은 꺼짐이며, **끄면 그림 생성이 멈춘다** —
> 렌더 워커가 사용자 키를 찾아 쓰는데(`render/render.worker.ts:141` 의 `credentials.resolve`)
> 키를 등록할 경로가 사라진다.

| Method | Route                     | Handler                                 |
| ------ | ------------------------- | --------------------------------------- |
| GET    | `/v1/api-keys`            | `list` (`api-keys.controller.ts:37-40`) |
| POST   | `/v1/api-keys`            | `create` (`:42-45`)                     |
| POST   | `/v1/api-keys/:id/verify` | `verify` (`:47-50`)                     |
| DELETE | `/v1/api-keys/:id`        | `remove` (`:52-56`)                     |

- 키 평문은 AES-256-GCM 봉인: `MASTER_KEY`(base64 32B) + 랜덤 nonce 12B + authTag 16B 이어붙임 — `api-keys/crypto.ts:1-40`
- `ApiKeyBreaker` (Redis): 1시간 윈도우 내 동일 키 5회 auth 실패 시 `isActive=false`로 비활성화 — `api-keys/api-keys.breaker.ts:7-47`
- `ApiKeysService.verify`: provider별 verify 호출 → 성공 시 `lastVerifiedAt`/`isActive` 갱신, auth 실패 시 비활성화 — `api-keys/api-keys.service.ts:66-93`

### 3.3 ProjectsModule (`projects/projects.controller.ts`)

| Method | Route                        | Handler                                                                                  |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/v1/projects`               | `list` (`projects.controller.ts:39-42`)                                                  |
| POST   | `/v1/projects`               | `create` (`:44-48`)                                                                      |
| GET    | `/v1/projects/:id`           | `detail` (`:50-53`) — pages id/order 포함                                                |
| PATCH  | `/v1/projects/:id`           | `patch` (`:55-58`) — `name?`, `thumbnail?`, `defaultStyleId?`, `defaultModel?` 부분 갱신 |
| POST   | `/v1/projects/:id/thumbnail` | `uploadThumbnail` (`:60-68`) — multipart `file`, `MAX_UPLOAD_BYTES`. 썸네일 키 교체      |
| DELETE | `/v1/projects/:id`           | `remove` (`:70-74`)                                                                      |

`PATCH`의 `defaultStyleId`는 프로젝트 대표 그림체 엔티티 id를 지정한다(렌더 시 자동 주입). `defaultModel`은 패널 인스펙터 모델 select의 초기값. 소유권 체크: `assertOwned` (`projects/projects.service.ts:116`, public 헬퍼).

#### 목록의 폴백 썸네일은 한 번에 읽는다

`thumbnail` 이 없으면 첫 페이지의 `background` 를 폴백 썸네일로 쓴다. 예전에는 그 조회가
프로젝트마다 한 번씩 나가는 N+1 이었다 — `thumbnail` 은 명시적 업로드로만 채워지므로
**기본 상태에서는 전부 폴백**이고, 프로젝트 20개면 21쿼리였다. `list` 는 썸네일 없는 id 를
모아 `firstBackgroundByProject` (`projects.service.ts:159`) 로 한 번에 읽는다
(`distinct: ['projectId']` + `orderBy [projectId, order]` — 정렬 뒤 프로젝트마다 첫 행).
단건 경로(create/detail/patch)는 모아 올 것이 없으므로 그대로 그 자리에서 한 번 읽는다.

#### 소유권 실패는 전부 404 다

**남의 리소스도, 없는 리소스도 똑같이 404** 다 (`projects.service.ts:126`). 예전에는 남의 것에
403 `RESOURCE_FORBIDDEN` 을 줬는데, 그러면 "그 id 는 실존하며 남의 것" 이 확인된다 — id 를
훑는 것만으로 다른 사용자의 리소스 존재 여부를 열거할 수 있다. 응답이 같아야 아무것도 새지 않는다.

코드는 `RESOURCE_NOT_FOUND` 가 아니라 도메인별 코드(`PROJECT_NOT_FOUND`, `PAGE_NOT_FOUND`,
`PANEL_NOT_FOUND`, `CONSISTENCY_NOT_FOUND`, `SPEECH_BUBBLE_NOT_FOUND`, `PAGE_TEXT_NOT_FOUND`,
`PAGE_LINE_NOT_FOUND`)를 쓴다. 웹의 문구 표에서 `RESOURCE_NOT_FOUND` 는 null(문구 없음)이라
호출부 문맥에 기대게 되는데, 도메인 코드는 그 자체로 안내가 된다.

같은 이유로 `PanelsService.restoreRender` 의 "성공한 렌더만 복원" 거부도 403 에서 400 으로
바꿨다 (`panels.service.ts:274`) — 403 인데 code 가 `CONFLICT` 라 상태 코드와 코드가 서로 다른
말을 하고 있었고, 같은 상황을 다루는 `RenderService.cancel` 은 이미 400 이다.

### 3.4 ConsistencyModule (`consistency/consistency.controller.ts`)

타입: `style | character | background | worldview` (`@comicai/types`).

| Method | Route                                 | Handler                                                                                                                                    |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/v1/projects/:pid/consistency?type=` | `list` (`consistency.controller.ts:59-63`)                                                                                                 |
| POST   | `/v1/projects/:pid/consistency`       | `create` (`:65-69`)                                                                                                                        |
| PATCH  | `/v1/consistency/:id`                 | `patch` (`:71-74`)                                                                                                                         |
| DELETE | `/v1/consistency/:id`                 | `remove` (`:76-80`) — style 삭제 시 트랜잭션으로 `Project.defaultStyleId`/`Panel.styleId` dangling 정리 (`consistency.service.ts:174-186`) |
| POST   | `/v1/consistency/:id/images`          | `uploadImages` (`:86-101`) — multipart `files`, 최대 12개, 파일당 `MAX_UPLOAD_BYTES`                                                       |
| POST   | `/v1/consistency/:id/generate`        | `generate` (`:104-107`) — AI 모델로 참조 이미지 1장 생성 (storage 업로드만, refImages 미등록). style 엔티티는 거부                         |
| POST   | `/v1/consistency/:id/images/attach`   | `attach` (`:110-113`) — `generate` 결과의 storageKey 를 refImages 에 등록 (key prefix 검증)                                                |

`refImages` 에 이미지를 덧붙이는 세 경로(`appendImages` `:209`, `attachImage` `:327`,
`PanelsService.appendUpload` `panels.service.ts:176`)는 **원자적 JSONB append** 를 쓴다
(`common/ref-images.ts`). 읽어서 `[...기존, 새것]` 으로 통째 덮어쓰면 동시 업로드가 유실된다 —
12장을 한 번에 드래그하면 전부 같은 배열을 읽고 각자 덮어써서 마지막 1장만 남고 나머지는
S3 고아가 된다. Prisma 에 JSON 배열 append 프리미티브가 없어 raw SQL 이며, 엔티티 쪽은
같은 문장에서 `version` 과 `updated_at` 도 올린다(`@updatedAt` 은 클라이언트가 채우는 값이라
이 경로에서는 손으로 넣어야 한다).

AI 생성 로직은 `consistency.service.ts:220-298` (`generateImage`) / `:304-334` (`attachImage`). 엔티티 타입별 system prompt (`ENTITY_SYSTEM_PROMPTS`, `:68-75`) 와 출력 비율(`ENTITY_OUTPUT_SHAPE`, `:54-61`)이 적용되어 패널-룰 대신 캐릭터 시트/환경 콘셉트/세계관 무드 보드 톤을 강제한다. style 은 그림체 자체가 다른 패널 결과의 일관성 기준이라 `generate` 자체를 거부 (`CONSISTENCY_GENERATE_UNSUPPORTED`).

키 조회는 **`try` 안에 있다**(`consistency.service.ts:260`). 밖에 두면 쿼터 초과·키 없음 같은
평범한 정책 거부가 `HttpException` 이 아닌 채로 예외 필터까지 올라가 500 `INTERNAL_ERROR` 가
되고, 서버 로그에는 정상 거부가 `unhandled exception` ERROR 로 쌓여 진짜 장애 신호를 덮는다.
실패는 전부 `CONSISTENCY_GENERATE_FAILED` + `details.category` 로 나가되 상태 코드만 분기한다 —
`statusForCategory` (`consistency.service.ts:39`): quota → 429, auth → 402, 나머지 → 400.
auth 에 401/403 을 쓰지 않는 이유는 웹이 401 을 "세션 만료"로 보고 로그인 화면으로 보내기
때문이다(`apps/web/app/providers.tsx:33`). 사용자 키로 호출했다가 auth 로 실패하면
`ApiKeyBreaker.recordAuthFailure` 로 차단기 카운터도 누적된다 — 예전에는 이 경로가
`resolved.id` 를 버려서 차단기와 `render_attempts_total` 을 함께 우회했다.

### 3.5 PagesModule (`pages/pages.controller.ts`)

| Method | Route                             | Handler                                                                                                                                        |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/projects/:pid/pages`         | `list` (`pages.controller.ts:25-28`)                                                                                                           |
| POST   | `/v1/projects/:pid/pages`         | `create` (`:43-47`)                                                                                                                            |
| POST   | `/v1/projects/:pid/pages/reorder` | `reorder` (`:49-52`) — body `{ pageIds: string[] }`로 페이지 순서 갱신. **순서를 바꾸는 유일한 경로다** (`PagePatchSchema` 에 `order` 가 없다) |
| GET    | `/v1/pages/:id`                   | `get` (`:54-57`)                                                                                                                               |
| PATCH  | `/v1/pages/:id`                   | `patch` (`:59-62`) — `order?`, `size?`, `name?`, `backgroundColor?`                                                                            |
| DELETE | `/v1/pages/:id`                   | `remove` (`:64-68`)                                                                                                                            |

### 3.6 PanelsModule (`panels/panels.controller.ts`)

| Method | Route                      | Handler                                                                               |
| ------ | -------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/v1/pages/:pageid/panels` | `list` (`panels.controller.ts:38-41`)                                                 |
| POST   | `/v1/pages/:pageid/panels` | `create` (`:43-47`)                                                                   |
| PATCH  | `/v1/panels/:id`           | `patch` (`:49-52`)                                                                    |
| DELETE | `/v1/panels/:id`           | `remove` (`:54-58`)                                                                   |
| GET    | `/v1/panels/:id/history`   | `history` (`:60-63`)                                                                  |
| POST   | `/v1/panels/:id/upload`    | `upload` (`:65-73`) — multipart `file`, `MAX_UPLOAD_BYTES` — 패널 refImages 에 append |
| POST   | `/v1/panels/:id/conti`     | `setConti` (`:75-83`) — multipart `file`, 콘티(러프 스케치) 단일 슬롯 교체            |
| DELETE | `/v1/panels/:id/conti`     | `clearConti` (`:85-88`) — 콘티 제거                                                   |

업로드는 `FileInterceptor`로 메모리 버퍼 수신 → `PanelsService.appendUpload` (`:169`) → `StorageService.storeUploadedImage`(검증+썸네일) → `appendPanelRefImages` 로 원자적 append (`common/ref-images.ts`).

리스트 응답은 currentRender의 presign URL + 콘티의 `contiUrl`을 동봉 — `panels/panels.service.ts`.

### 3.6b SpeechBubblesModule (`speech-bubbles/*`)

페이지 직속 말풍선의 CRUD + reorder. 패널과 독립이며 렌더에는 영향 없고 export 합성에서만 사용된다. 말풍선은 모양/선/채움만 담당하고 텍스트는 [[page-text]] 오브젝트로 분리되었다(2026-05-19 migration 이후).

| Method | Route                                      | Handler                                                 |
| ------ | ------------------------------------------ | ------------------------------------------------------- |
| GET    | `/v1/pages/:pageid/speech-bubbles`         | `list` (`speech-bubbles.controller.ts:36-39`)           |
| POST   | `/v1/pages/:pageid/speech-bubbles`         | `create` (`:53-57`) — `order`는 MAX+1 자동 할당         |
| POST   | `/v1/pages/:pageid/speech-bubbles/reorder` | `reorder` (`:59-62`) — body `{ ids: string[] }`         |
| PATCH  | `/v1/speech-bubbles/:id`                   | `patch` (`:64-67`) — `variant`/`shape`/`style` (text X) |
| DELETE | `/v1/speech-bubbles/:id`                   | `remove` (`:69-73`)                                     |

소유 검증은 `page→project→userId` 체인을 `PagesService.findOwned` (`pages.service.ts:154`) 와 자체 `assertOwned`로 처리 — `panels.service.ts` 패턴과 동일. `findOwned` 는 **페이지 행 전체**를 돌려준다: 예전에는 id/projectId 만 읽어서 `PagesService.get` 이 곧바로 같은 행을 다시 읽었고(에디터가 페이지를 열 때마다 왕복 2회), 페이지 행은 작으므로 소유권만 필요한 호출부가 조금 더 읽는 비용보다 왕복 하나를 없애는 쪽이 낫다.

### 3.6c PageTextsModule (`page-texts/*`)

페이지 직속 자유 텍스트 박스 (만화 효과음/자막/내레이션 등). 말풍선과 마찬가지로 패널·렌더와 독립이며, export 단계에서 말풍선 위·자유 직선 아래 레이어로 합성된다(`apps/api/src/export/page-text.render.ts`).

| Method | Route                                  | Handler                                                   |
| ------ | -------------------------------------- | --------------------------------------------------------- |
| GET    | `/v1/pages/:pageid/page-texts`         | `list` (`page-texts.controller.ts:40-43`)                 |
| POST   | `/v1/pages/:pageid/page-texts`         | `create` (`:57-61`) — `order`는 MAX+1 자동 할당           |
| POST   | `/v1/pages/:pageid/page-texts/reorder` | `reorder` (`:63-66`) — body `{ ids: string[] }`           |
| PATCH  | `/v1/page-texts/:id`                   | `patch` (`:68-71`) — `x/y/w/h`, `text`, `style` 부분 갱신 |
| DELETE | `/v1/page-texts/:id`                   | `remove` (`:73-77`)                                       |

`text` 는 단순 평문(줄바꿈만 보존, TipTap 미사용), `style` 은 `PageTextStyle` (fontSize/fontFamily/color/textAlign) 의 partial 머지로 정규화 — `page-texts.service.ts:67-89` (`create`) / `:91-105` (`patch`). 소유 검증은 `PagesService.findOwned` 와 자체 `assertOwned`로 동일 패턴.

### 3.6d PageLinesModule (`page-lines/*`)

페이지 직속 자유 직선 (가이드선/말풍선 연결선/패널 구분선 등). 패널·렌더와 독립이며, export 단계에서 최상단(말풍선·자유 텍스트 위) 레이어로 합성된다(`apps/api/src/export/page-line.render.ts`).

| Method | Route                                  | Handler                                         |
| ------ | -------------------------------------- | ----------------------------------------------- |
| GET    | `/v1/pages/:pageid/page-lines`         | `list` (`page-lines.controller.ts:38-41`)       |
| POST   | `/v1/pages/:pageid/page-lines`         | `create` (`:56-60`) — `order`는 MAX+1 자동 할당 |
| POST   | `/v1/pages/:pageid/page-lines/reorder` | `reorder` (`:62-65`) — body `{ ids: string[] }` |

네 재정렬 경로(pages / speech-bubbles / page-texts / page-lines)는 모두 `isReorderPermutation`
(`common/reorder.ts:13`) 으로 **순열인지** 검사한다. 예전에는 각자 "길이가 같은가 + 전부 이
페이지 소속인가" 만 봤는데, 그건 집합 비교라 `["a","a"]` 가 통과했다 — 길이 2, 둘 다 소속.
통과하면 트랜잭션이 같은 행에 order 0·1 을 연달아 쓰고 밀려나야 할 행은 옛 order 를 그대로
들고 있어, 두 항목이 같은 order 를 갖는다. 그때부터 순서가 요청마다 흔들린다
(export 합성 순서·에디터 네비게이션에 그대로 나타난다).
| PATCH | `/v1/page-lines/:id` | `patch` (`:67-70`) — `x1/y1/x2/y2`, `style` 부분 갱신 |
| DELETE | `/v1/page-lines/:id` | `remove` (`:72-76`) |

`style` 은 세 모듈(PageLine/PageText/SpeechBubble) 모두 PatchSchema 에서 `.partial()` 이므로,
patch 는 **기본값 → 기존 값 → 입력** 3항 병합이어야 한다. 기존 값을 빼먹으면 명시하지 않은
필드가 기본값으로 되돌아간다 — 굵기 8인 선의 색만 바꿔도 굵기가 리셋된다.

병합은 세 모듈이 공유하는 `mergeStyle` (`common/style-merge.ts:15`) 한 곳에서만 한다.
예전에는 세 서비스가 각자 인라인으로 병합하고, 규칙을 고정한다는 `style-merge.spec.ts` 는
**그 파일 안에 자기만의 `merge` 를 정의해 두고 있었다** — 테스트가 통과해도 서비스가 그
규칙을 지킨다는 보장이 없었던 셈이다. 지금 spec 은 서비스가 쓰는 바로 그 함수를 가져온다.
PageText 만 병합 뒤에 폰트 보정이 한 겹 더 붙는다(`page-texts.service.ts:33`).

세 모듈은 소유권 판정·순서 채번도 공유한다 — `assertPageChildOwned` · `nextOrder` ·
`PAGE_CHILD_SELECT` (`common/page-child.ts`). **조회 자체는 각 서비스에 남는다**:
Prisma 델리게이트는 모델마다 다른 제네릭 타입이라 셋을 한 파라미터로 받으려면 캐스트가
필요한데, 소유권 검사 경로에서 타입을 느슨하게 만들 이유가 없다. 그래서 조회 결과의
모양(`PageChildRow`)과 판정 규칙만 공유한다.

좌표는 페이지 좌표계 절대값 두 점(x1/y1/x2/y2)으로 저장된다. tldraw 측은 BaseBoxShape 패턴(bbox + bbox 내 normalized 두 끝점)으로 표현하며, sync hook(`apps/web/components/editor/tldraw/use-page-line-sync.ts`)이 두 표현을 양방향 변환한다. `style` 은 `PageLineStyle` (`strokeWidth/strokeColor/strokeStyle='solid'|'dashed'`) 의 partial 머지로 정규화 — `page-lines.service.ts:63-84` (`create`) / `:86-99` (`patch`).

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

**SVG 조립은 `export/svg.ts` 한 곳이다.** 문서 래퍼(`<svg xmlns … viewBox>`)가 다섯 벌,
레이어 껍데기(빈 배열→null → map → join → Buffer)가 세 벌로 흩어져 있던 것을 `svgDocument`
(`export/svg.ts:31`)·`svgLayer` (`:39`) 로 모았다.

**색은 읽는 쪽에서도 흡수한다** — `safeColor` (`export/svg.ts:21`). 예전에는 패널 외곽선만
hex 폴백을 갖고 있었고 말풍선·텍스트·직선은 저장된 문자열을 그대로 SVG 속성에 넣었다.
새 입력은 `ColorStringSchema` 가 막지만 **그 검증이 생기기 전에 저장된 행은 거치지 않았다** —
그러면 캔버스와 export 결과가 다르게 보이는데 어느 쪽도 오류를 내지 않는다. 폴백은 각
도메인의 기본 스타일 값을 쓴다.

각 패널의 `currentRender` 결과를 패널 shape 마스크(SVG)로 잘라 `composite` — `export/export.service.ts:113-153`. 그 위로 말풍선(`:157-166`) → 자유 텍스트(`:169-181`) → 자유 직선(`:184-195`) 레이어가 순서대로 쌓인다. `sharp`로 캔버스(페이지 size, alpha)를 만들어 전체를 합성하며 dpi는 `withMetadata({ density: dpi })`(기본 150)로 박힌다 — `:197-208`. 결과는 S3에 `exports/{userId}/{pageId}/{ulid}.{ext}` 키로 업로드 후 presign URL 반환 — `:210-218`.

**캔버스 크기는 방어적으로 묶는다** — `clampDimension` (`export.service.ts:230`) 이 페이지 크기를
`MAX_PAGE_DIMENSION`(4096) 이하로, 패널 bounding box 도 캔버스 크기로 자른다 (`:119-120`).
`PageSizeSchema` 가 이제 상한을 걸지만 **이미 저장된 행은 그 검증을 거치지 않는다**. 묶지 않으면
`size:{w:50000,h:50000}` 한 행으로 sharp 가 10GB 할당을 시도하다 프로세스가 죽고, 같은 컨테이너의
다른 사용자 요청까지 함께 끊긴다.

**패널 합성은 4개씩 끊어 돈다** — `mapLimit` (`export.service.ts:240`) +
`PANEL_COMPOSITE_CONCURRENCY` (`:33`). 예전에는 `Promise.all` 로 전부 한꺼번에 돌려서
**N개의 원본 바이트와 N개의 마스킹된 PNG 버퍼가 동시에 살아 있었다** — 1536×1024 RGBA 기준
패널당 약 6MB 라 12컷 페이지면 마스킹본만 ~75MB 에 원본이 더 붙는다. 원본은
`maskedPanelImage` (`:52`) 안에서만 살아 마스킹본과 겹쳐 붙들리지 않는다. 결과 순서는 입력
순서를 유지한다 — 합성 순서가 곧 z-order 다.

### 3.9 HealthController / MetricsController

- `GET /healthz` (글로벌 prefix 제외) — `health/health.controller.ts:44`. 응답은 `{ ok, at }` 뿐이다.
  **어떤 의존성이 죽었는지는 응답이 아니라 로그로 나간다** (`:79`) — 인증 없이 열린 엔드포인트라
  내부 구성을 알려 줄 이유가 없다. 예전에는 `@SkipThrottle()` 에 `db/redis/s3` 를 그대로 실어
  보냈고, 파일의 주석은 정반대를 선언하고 있었다.
- 요청마다 Postgres 쿼리 1 + Redis ping + S3 `HeadBucket` 을 돌리므로 **무제한이면 그 자체가
  증폭 벡터다** — 초당 수백 번이면 Prisma 커넥션 풀이 헬스체크로 차서 실제 요청이 밀린다.
  `@Throttle` 분당 60회(`:32`)에 더해 검사 결과를 `PROBE_CACHE_MS`(2초, `:16`) 동안 재사용하고
  진행 중인 검사는 공유한다(`checkDependencies`, `:62`). 스로틀만으로는 한 창 안의 버스트가
  남고, 2초 타임아웃은 `Promise.race` 라 **밑에서 도는 작업을 취소하지 않기** 때문이다.
  도커 헬스체크는 5초 간격(분당 12회)이고 컨테이너 안 localhost 에서 오므로 외부 트래픽과
  스로틀 버킷도 다르다 — 캐시가 있어도 매 헬스체크는 새 검사를 본다.
- `GET /v1/metrics` (`@SkipThrottle` + `MetricsGuard`) — `metrics/metrics.controller.ts:14-18`
  - **`METRICS_TOKEN` Bearer 토큰이 있어야 열린다**(`metrics/metrics.guard.ts:22`).
    토큰이 설정되지 않았으면 **아무도 못 본다** — 깜빡했을 때 전체 공개가 되는 것보다
    스크레이퍼가 404 를 받는 쪽이 안전하다(`AdminGuard` 와 같은 판단).
  - 403 이 아니라 404 인 이유: 인증 실패를 알려 주면 "여기에 메트릭이 있다" 는 사실을
    확인해 준다. `FeatureFlagGuard` 도 같은 이유로 404 를 쓴다.
  - 공개하면 안 되는 이유는 프로세스 상태만이 아니다. `http_requests_total` 로 엔드포인트별
    실패율이, `render_attempts_total` 로 모델별 총 생성 건수(= 사업 지표)가 그대로 나간다.
  - 스크레이핑: `curl -H "Authorization: Bearer $METRICS_TOKEN" .../v1/metrics`
- Prometheus 메트릭: `http_requests_total`, `http_request_duration_seconds`, `render_attempts_total{model,outcome}`, `render_duration_seconds{model}` + `comicai_` 프리픽스의 default metrics — `metrics/metrics.service.ts:15-46`

### 3.10 EmailModule

- `@Global()` 모듈. `ConsoleEmailProvider`가 기본(프로덕션에서 경고 로그) — `email/email.module.ts:4-21`
- `EmailService.sendVerification / sendPasswordReset`는 `${WEB_ORIGIN}/verify-email/{token}` 또는 `${WEB_ORIGIN}/reset-password?token=...`로 링크 구성 — `email/email.provider.ts:37-53`

---

### 3.10b 모델 자격 증명 (`render/model-credentials.ts`)

그림 생성에 쓸 키를 고르는 곳. 예전에는 이 로직이 렌더 워커와 일관성 서비스에
**두 벌로 복제**돼 있어서, 한쪽만 고치면 컷 렌더는 되는데 참조 이미지 생성만 죽었다.

- 우선순위는 **사용자 키 → 플랫폼 키**(`resolve`, `model-credentials.ts:62`). 사용자가
  자기 키를 넣어 뒀다면 비용은 본인이 내는 것이므로 상한을 걸지 않는다.
- **플랫폼 키를 쓸 때만 하루 상한을 본다**(`PLATFORM_DAILY_RENDER_LIMIT`, 기본 20).
  이게 없으면 가입자 누구나 무제한으로 회사 키를 태울 수 있다 — ThrottlerModule 의
  rate limit 은 요청 빈도 제한이지 지출 상한이 아니다.
- **계량은 키를 내주는 자리에 있다** — `consumePlatformQuota` (`model-credentials.ts:110`)
  가 Redis 카운터 `platform:usage:{userId}:{YYYY-MM-DD}` 를 INCR 하고 상한을 넘으면
  `UsageLimitError` 를 던진다. 예전에는 `renderJob` 행 수를 셌는데, 그 테이블에 행을
  넣는 곳이 컷 렌더 하나뿐이라 **같은 키를 받아 가는 참조 이미지 생성은 상한을 통째로
  우회**했다(카운터를 읽기만 하고 올리지 않았다). 호출부가 늘어도 새지 않도록 키를
  내주는 이 지점에서 센다.
- 세는 것은 성공이 아니라 **키를 내준 것**이다. 실패한 호출에도 대부분 비용이 청구되고,
  실패를 공짜로 두면 무한 재시도로 우회할 수 있다. 사용자 키 경로와 `mock` 은 카운터에
  닿지 않는다 — 예전 카운터는 출처를 구분하지 않아서, 자기 키로만 그린 사람도 그 키가
  차단되는 순간 플랫폼 키를 쓴 적 없이 "하루치를 다 썼다"는 이유로 막혔다.
- Redis 가 죽으면 예외가 그대로 올라간다. 지출 상한은 열어 두는 쪽이 더 위험하고, 아직
  모델을 부르기 전이라 실패해도 돈이 나가지 않는다.
- 던지는 예외는 자기 분류를 들고 있다(`ApiKeyMissingError` = auth,
  `UsageLimitError` = quota). `classifyModelError` (`render/model-error.ts:14`) 가 그걸
  존중한다 — 어댑터의 `classifyError` 에 넘기면 프로바이더 HTTP 응답만 볼 줄 알아서 전부
  `transient` 로 떨어지고, 재시도해도 소용없는 실패를 유료로 3번 반복하게 된다.
  워커(`render.worker.ts:163`)와 참조 이미지 생성(`consistency.service.ts:277`)이 같은
  함수를 쓴다.

### 3.10c EmailModule (`email/email.module.ts`)

`RESEND_API_KEY` 가 있으면 Resend HTTP API 로 실제 발송하고, 없으면 콘솔에 찍는다
(`email.module.ts:17`). SDK 를 넣지 않은 이유는 요청이 POST 하나뿐이라 `fetch` 로
충분하고, 제공자를 바꿀 때 의존성까지 갈아 끼우지 않아도 되기 때문이다.

발송 실패는 **삼키지 않고 던진다**(`email.provider.ts:94`). 삼키면 가입은 성공한 것처럼
끝나는데 사용자는 인증 메일을 영영 못 받고 로그에도 아무것도 안 남는다.

키가 없는 채로 프로덕션이면 부팅 시 `error` 레벨로 경고한다 — 그 상태에서는
이메일 인증과 비밀번호 재설정을 끝낼 수 없다.

### 3.11 AdminModule (`admin/admin.controller.ts`)

운영자용 **읽기 전용** 현황. 쓰기 동작은 일부러 넣지 않았다 — 운영 화면에서 지울 수 있게
만드는 순간 실수 한 번의 대가가 커진다.

| Method | Path                 | Handler                               |
| ------ | -------------------- | ------------------------------------- |
| GET    | `/v1/admin/overview` | `overview` (`admin.controller.ts:19`) |
| GET    | `/v1/admin/users`    | `users` (`:54`)                       |

- 가드는 `SessionGuard` → `AdminGuard` 순서다(`admin.controller.ts:17`). `req.user` 를
  채우는 것이 `SessionGuard` 이므로 순서가 뒤바뀌면 안 된다.
- 허용 목록은 환경변수 `ADMIN_EMAILS`(쉼표 구분)에서만 온다 — **이 저장소는 공개라**
  코드에 이메일을 적으면 그대로 공개된다. 모듈 로드 시 한 번 파싱한다
  (`auth/admin.guard.ts:13`), 값을 바꾸면 재기동이 필요하다.
- **목록이 비어 있으면 아무도 관리자가 아니다**(`packages/types/src/features.ts` 의
  `isAdminEmail`). 설정을 깜빡했을 때 전원이 관리자가 되는 것보다 안전하다.
  이 경계는 `features.spec.ts` 와 `auth/admin.guard.spec.ts` 가 고정한다.
- **이메일 인증을 마친 계정만 관리자가 된다**(`auth/admin.guard.ts:26`). 목록에 적힌
  이메일에 아직 계정이 없으면 그 주소를 아는 사람이 **먼저 가입해 선점**할 수 있고,
  공개 저장소라 운영자 이메일은 `git log` 에 그대로 보인다. 메일함을 실제로 가진 사람만
  통과하게 해야 그 경로가 닫힌다. 그래서 가드는 세션의 이메일이 아니라 DB 의 계정을
  다시 읽는다(`auth/admin.guard.ts:52`) — 세션에는 인증 시각이 없다.
- 이메일은 DB 에서 `citext` 다(`packages/db/prisma/schema.prisma:17`). `text` 로 두면
  `Admin@x.com` 과 `admin@x.com` 이 서로 다른 계정이 되는데 운영자 판정은 소문자로
  비교하므로, **대소문자만 바꿔 가입하면 그대로 운영자가 됐다.** 앱 쪽에서도
  `EmailSchema`(`packages/types/src/schemas.ts:32`)가 정규화하지만, 앱을 우회하는 경로가
  생겨도 안전해야 하므로 DB 에서 한 번 더 막는다.
- `/me` 응답의 `isAdmin`(`me/me.controller.ts:89`)은 **화면을 숨기는 용도일 뿐**이다.
  클라이언트 판정은 우회할 수 있으므로 실제 차단은 위 가드가 한다.
- 사용자 목록에 비밀번호 해시·API 키·아바타 저장 키는 넣지 않는다. 운영 화면에서 볼 이유가
  없고, 한 번 응답에 실리면 브라우저 캐시·로그·스크린샷을 타고 퍼진다.

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
- `enqueue`: `jobId = idempotencyKey(ir, userId, model)` = `'job_' + sha256(ir+userId+model).slice(0,32)` — `:34-44, 56-58`. `attempts: 3`, `exponential backoff 2s`, `removeOnComplete.age 86400`,
  `removeOnFail: { age: 7*86400, count: 1000 }` (`:51`) — `false` 로 두면 실패 잡이 Redis 에
  **영구 적재**된다. 7일이면 사후 분석에 충분하고 개수 상한이 폭주를 막는다.

### 5.2 워커 (`render/render.worker.ts`)

- 모듈 init에서 `RENDER_WORKER_DISABLED === '1'`이면 워커를 만들지 않음(즉 API 프로세스에서 워커 분리 가능) — `:39`
- concurrency: `RENDER_CONCURRENCY ?? 2` — `:46`
- **실패에는 반드시 로그가 남는다** (`:196-205`). 없으면 프로덕션에서 컷이 실패했을 때 단서가
  DB 행의 `error.message` 뿐이다. 정책 거부(`auth`/`quota`/`safety`/`invalid`, `POLICY_CATEGORIES`)는
  정상 동작이라 `warn`, 나머지는 `error` — 정상 거부를 ERROR 로 쌓으면 진짜 장애 신호를 덮는다.
  마감 자체가 실패하는 경로(`finalizeOrphan` 의 catch, `:92`)도 더 이상 조용히 삼키지 않는다.
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
- `SSE_HUB_DISABLED` 가 켜져 있으면 Redis 연결 자체를 만들지 않음 (`isFlagOn`) — `:54`

### 5.4 IR 빌더 (`render/ir.builder.ts`)

- Panel + Project 컨텍스트에서 `RenderIR`을 합성 — `:21-83`
- TipTap 멘션 노드에서 `consistencyEntity.id`를 추출(`resolveMentionIds`), DB 조회 후 텍스트에 이름 치환(`serializeTextWithNameReplacement`) — `:38-46`
- 그림체(`style`) 자동 주입: `panel.styleId ?? project.defaultStyleId` 를 `effectiveStyleId` 로 결정하여 멘션 대상이 아니라도 styles 페이로드에 포함. 멘션된 style 엔티티는 무시 — `:34-36, 61-63`
- entity type별로 `styles | characters | backgrounds | worldviews` 페이로드 분리 — `:53-67`
- `aspectRatio`와 `panelSize`는 패널 shape의 bounding box로 계산 — `:85-98`

---

## 6. 스토리지 (`storage/storage.service.ts`)

- AWS SDK v3 `S3Client` + `forcePathStyle: true` (MinIO 호환) — `:49`
- 두 개의 클라이언트 보유: 내부 endpoint(`S3_ENDPOINT`)와 presign 전용(`S3_PUBLIC_ENDPOINT`) — `:28-55`. 외부(브라우저)에서 SigV4 host 검증을 통과시키기 위함.
- 환경 변수: `S3_ENDPOINT(=http://localhost:9000)`, `S3_PUBLIC_ENDPOINT`, `S3_REGION(=us-east-1)`, `S3_BUCKET(=comicai)`, `S3_ACCESS_KEY(=minioadmin)`, `S3_SECRET_KEY(=minioadmin)` — `:41-48`
- 부팅 시 `HeadBucketCommand` → 없으면 `CreateBucketCommand`. `STORAGE_AUTO_CREATE_BUCKET` 은 **기본이 켜짐**인 플래그라 `isFlagOnByDefault` 로 읽는다 — `:70`
- presign TTL: 15분 — `:23`
- 키 스킴 (`buildKey`, `:183-202`) — **prefix 로 지울 수 있게 전부 소유 리소스로 묶는다**:
  - `projects/{projectId}/panels/{panelId}/renders/{renderJobId}.{ext}` — render 결과. 예전에는
    `projects/_/renders/{jobId}` 라 projectId 자리가 뭉개져 있어서, 프로젝트를 지울 때 그
    프로젝트의 렌더 결과만 골라낼 방법이 없었다. **컷 아래**에 두는 이유는 그래야
    프로젝트·페이지·컷 세 단계 삭제가 전부 prefix 하나로 끝나기 때문이다 — 프로젝트 바로
    아래였다면 컷 하나를 지울 때 그 컷의 잡 id 를 모아 개별 키를 지워야 한다.
    `projectId` 는 IR 에 이미 들어 있다(`ir.builder.ts:88` → `render.worker.ts:148`).
    **옛 키를 옮기지는 않았다** — 삭제 경로 자체가 이번에 처음 생기므로 정리 대상이 쌓여 있지
    않고, 옛 키도 `storageKey` 를 그대로 들고 있어 읽기는 계속 된다.
  - `projects/{projectId}/refs/{entityId}/{ulid}.{ext}` — consistency 참조 이미지 (수동 업로드 + AI generate 결과)
  - `projects/{projectId}/panels/{panelId}/upload/{ulid}.{ext}` — 패널 업로드
  - `projects/{projectId}/panels/{panelId}/conti/{ulid}.{ext}` — 콘티 스케치 (POST `/v1/panels/:id/conti`)
  - `projects/{projectId}/thumbnail/{ulid}.{ext}` — 프로젝트 썸네일 (POST `/v1/projects/:id/thumbnail`)
  - `users/{userId}/avatar/{ulid}.{ext}` — 사용자 아바타 자체 업로드 (POST `/v1/me/avatar`)
  - `exports/{userId}/{pageId}/{ulid}.{ext}` — 페이지 내보내기
- 삭제 (`deleteByPrefix`, `:161` / `deleteKeys`, `:199`) — **둘 다 던지지 않는다.** 호출부는
  전부 "DB 행을 이미 지운 뒤" 라, 여기서 던지면 사용자는 삭제에 성공했는데 500 을 받고 다시
  눌러도 지울 대상이 없어 계속 실패한다. 실패는 로그로 남기고 넘어간다 — 남은 오브젝트는
  예전과 같은 미아일 뿐이다. `deleteKeys` 는 파생 썸네일(`{key}.thumb.webp`)도 같이 지운다.
- 삭제 prefix 는 `StoragePrefix` (`:249`) 에 모여 있고 **`buildKey` 와 같은 파일에 있다.**
  키 규칙과 삭제 규칙이 떨어져 있으면 키만 바꿨을 때 삭제가 조용히 0건이 된다 —
  실패가 아니라 성공으로 보인다. 그 불변식은 `storage-keys.spec.ts` 가 고정한다.
- 삭제가 걸린 지점: 프로젝트(`projects.service.ts:94`, prefix + 페이지별 export),
  페이지(`pages.service.ts:110`, 컷별 prefix + export), 컷(`panels.service.ts:160`),
  일관성 엔티티(`consistency.service.ts:188`), 프로젝트 썸네일 교체(`projects.service.ts:89`),
  아바타 업로드·삭제·해제(`me.controller.ts:143`, `:157`, `:120`).
  **DB 를 먼저 지우고 그다음 S3 다** — 반대 순서면 S3 삭제 성공 뒤 DB 삭제가 실패했을 때
  화면에는 남아 있는데 이미지가 전부 깨진 리소스가 된다.
- 업로드는 `validateAndNormalizeImage`(`storage/image-validator.ts`)로 검증 후 sharp로 256×256 webp 썸네일 자동 생성 — `:118-133`
- `presignIfSucceeded`: render status가 `succeeded`일 때만 presign URL 반환 — `:143-149`
- `getBytes`는 어댑터 컨텍스트(`loadReference`)와 export 합성에서 사용 — `:216-229`

---

## 7. 외부 모델 어댑터 연계

- 패키지: `packages/adapters` — `index.ts:35-45`에 `REGISTRY` 정의.
  - `mock` → `MockAdapter`
  - `gemini-3.1-flash-image-preview` → `GeminiAdapter`
  - `gpt-image-2` → `OpenAIAdapter`
- 인터페이스 `ModelAdapter` — `packages/adapters/src/index.ts:8-13`:
  - `buildRequest(ir, apiKey)` → unknown
  - `call(req, signal, ctx)` → `Promise<AdapterImage>`
  - `classifyError(err)` → `RenderError { category, ... }`
- `AdapterContext.loadReference`는 워커가 `StorageService.getBytes`로 주입 — `apps/api/src/render/render.worker.ts:69`
- API → adapters 호출 경로는 오직 `RenderWorker.process`뿐 (`render.worker.ts:73-77`). 컨트롤러는 큐에 enqueue만 한다.
- BYOK 키 선택 규칙: 모델 ID가 `gemini`로 시작하면 provider=`gemini`, 그 외 `openai` — `render.worker.ts:137-144`. 키가 없으면 `RenderApiKeyMissing`(category=`auth`)로 throw하여 즉시 실패 처리(retry limit 1).

---

## 8. 환경 변수 요약

### 읽는 규칙

- **Redis 주소는 `redisUrl(config)` 한 곳에서만 읽는다** (`common/env.ts:18`). 예전에는 일곱
  곳이 각자 읽었고 그중 `sse.hub.ts` 하나만 `ConfigService` 가 아니라 `process.env` 였다.
  `ConfigService` 는 `ConfigModule.forRoot()` 가 `.env` 를 로드한 뒤의 값을 보는데
  `process.env` 는 그 시점에 아직 비어 있을 수 있어, **SSE 만 다른 Redis 를 보는** 상태가
  만들어진다 — 증상은 "워커 이벤트가 브라우저에 안 간다" 로 나타나 원인을 짚기 어렵다.
  기본값 문자열도 일곱 벌이었다.
- **플래그는 `isFlagOn` / `isFlagOnByDefault`** (`packages/types/src/features.ts:10`, `:23`).
  기본이 꺼짐이면 앞의 것, 켜짐이면 뒤의 것. 손으로 `=== '1'` / `!== '0'` 을 쓰면 규칙이
  갈리는데, 특히 `!== '0'` 은 `'false'`·`'off'` 를 켜짐으로 읽어 **끄려던 사람이 못 끈다.**

| 키                                                                                                   | 위치                                                           | 기본/비고                            |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `API_PORT`                                                                                           | `main.ts:20`                                                   | `4000`                               |
| `WEB_ORIGIN`                                                                                         | `main.ts:16`, `oauth.controller.ts:39`, `email.provider.ts:34` | `http://localhost:3000`              |
| `API_PUBLIC_URL`                                                                                     | `oauth.service.ts:125`                                         | OAuth callback base                  |
| `REDIS_URL`                                                                                          | `redisUrl()` 한 곳에서만 읽는다 — `common/env.ts:18`           | `redis://localhost:6379`             |
| `DATABASE_URL`                                                                                       | `schema.prisma:9`                                              | Postgres                             |
| `S3_ENDPOINT` / `S3_PUBLIC_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `storage.service.ts:43-50`                                     | MinIO 기본값                         |
| `STORAGE_AUTO_CREATE_BUCKET`                                                                         | `storage.service.ts:70`                                        | 기본 켜짐. 끄려면 `0`/`false`        |
| `MASTER_KEY`                                                                                         | `api-keys/crypto.ts:8-14`                                      | base64 32B, BYOK AES-GCM 봉인 키     |
| `COOKIE_SECURE`                                                                                      | `session.service.ts:167`                                       | secure 쿠키 토글                     |
| `RENDER_WORKER_DISABLED`                                                                             | `render.worker.ts:30`, `sse.hub.ts:49`                         | `'1'`이면 API 프로세스에서 워커 분리 |
| `RENDER_CONCURRENCY`                                                                                 | `render.worker.ts:37`                                          | 기본 2                               |
| `SSE_HUB_DISABLED`                                                                                   | `sse.hub.ts:54`                                                | 테스트용                             |
| `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, `GITHUB_OAUTH_CLIENT_ID`/`_SECRET`                               | `oauth.service.ts:96-99`                                       | 둘 다 있어야 provider 활성           |
| `LOG_LEVEL`, `NODE_ENV`                                                                              | `app.module.ts:26-33`                                          | pino 레벨/포맷                       |

---

## 9. 그 외 공통 유틸

- `common/tokens.ts` — `urlSafeToken`, `hexToken`, `sha256Hex`
- `common/upload.ts` — `requireUploadedFile` (multer 파일 가드)
- 패널 shape bounding box 는 `@comicai/types` 의 `shapeBoundingBox` 를 **직접** 쓴다. 예전에는 `common/bbox.ts` 가 1줄 배럴로 재수출했는데, 소비자 일부는 배럴을, 일부(`export/panel-mask.ts`)는 원본을 import 해서 같은 함수가 두 경로로 들어왔다 — 배럴을 없앴다.
- `storage/image-validator.ts` — 업로드 이미지 MIME/사이즈/픽셀 검증 + sharp 정규화 (`MAX_UPLOAD_BYTES` export)
- `metrics/metrics.interceptor.ts` — HTTP 메트릭 인터셉터(이미 `applyAppPipeline`을 통해 등록됨)
