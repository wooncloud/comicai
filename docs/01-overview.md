# 01 — 프로젝트 개요

> 본 문서는 `comicai` 저장소를 **실제 코드 기준**으로 설명한다. `develop-docs/` 하위의 구 기획 문서는 역사적 맥락 또는 아직 도달하지 못한 목표를 담고 있으므로 본 문서가 코드와 불일치할 경우 항상 코드를 우선한다.

## 1. 제품이 무엇인가

ComicAI는 **AI가 만화의 일관성(캐릭터·배경·세계관·그림체)을 유지하며 패널 단위로 이미지를 생성해 주는 웹 제작 도구**다. 한 번 정의한 캐릭터/배경/그림체 엔티티를 이후 모든 패널 렌더에서 참조로 흘려보내, 동일 세계관을 유지한 채로 컷을 채워 나가는 흐름을 제공한다. (배경: `PRD.md`, `README.md`, `REQUIREMENTS.md`.)

코드상 실제로 동작하는 핵심 흐름은 다음과 같다.

- 인증/세션 + 사용자 BYOK API 키 관리 (`apps/api/src/auth`, `apps/api/src/api-keys`)
- 프로젝트 → 페이지 → 패널 트리 CRUD (`apps/api/src/projects` `pages` `panels`)
- "일관성 엔티티"(스타일/캐릭터/배경/세계관) CRUD + 참조 이미지 업로드 (`apps/api/src/consistency`)
- tldraw 기반 패널 캔버스 + TipTap 멘션 텍스트 에디터 (`apps/web/components/editor`)
- 패널 렌더 큐(BullMQ) + 어댑터(mock/Gemini/OpenAI) + SSE 진행률 스트리밍 (`apps/api/src/render`, `packages/adapters`, `packages/events`)
- 페이지 내보내기 (`apps/api/src/export` — `panel-mask.ts`로 패널 알파 마스크 합성)

`packages/types/src/index.ts` 의 `ModelId` 는 현재 `'gemini-3.1-flash-image-preview' | 'gpt-image-2' | 'mock'` 세 가지가 등록되어 있다.

## 2. 최상위 레이아웃

```
comicai/
├── apps/
│   ├── api/                  # NestJS HTTP + 워커
│   └── web/                  # Next.js 15 App Router
├── packages/
│   ├── adapters/             # 모델 어댑터(mock/gemini/openai)
│   ├── db/                   # Prisma 스키마 + ID 유틸
│   ├── events/               # 렌더 SSE 이벤트/멘션 직렬화
│   └── types/                # 공통 DTO/Zod 스키마/경로 상수
├── infra/
│   ├── compose/              # docker compose (dev, full)
│   ├── docker/               # api/web Dockerfile
│   └── backup/               # 일일 백업 컨테이너
├── docs/                     # (현재 문서 트리)
├── scripts/                  # cmux-bootstrap 등
├── package.json              # pnpm workspaces 루트
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── PRD.md / REQUIREMENTS.md / README.md
```

## 3. 최상위 도구 체인

- **패키지 매니저**: pnpm 9 (`packageManager` 필드). 워크스페이스 구성은 `pnpm-workspace.yaml` 에서 `apps/*`, `packages/*` 만 포함.
- **태스크 러너**: turbo 2 (`turbo.json`). `dev`/`build`/`lint`/`typecheck`/`test` 가 모든 워크스페이스로 분배되며, `@comicai/api#dev` 는 `types`/`db`/`events`/`adapters` 의 `build` 에 의존하도록 명시되어 있다.
- **TypeScript**: 루트 `tsconfig.base.json` 이 strict + `noUncheckedIndexedAccess` + ES2022/ESNext/Bundler 해석을 강제. 각 패키지가 이를 extend.
- **포맷/훅**: prettier 3 + husky 9 + lint-staged (루트 `package.json`).
- **Node**: `>=20`.

루트 스크립트 (`package.json`):

```
pnpm dev        # turbo run dev  (web + api 동시 기동)
pnpm build      # turbo run build
pnpm typecheck  # turbo run typecheck
pnpm test       # turbo run test
```

## 4. 워크스페이스 별 설명

### 4.1 `apps/api` — NestJS

NestJS 10 기반 단일 프로세스로 두 가지 엔트리포인트를 가진다.

- `apps/api/src/main.ts` — HTTP 서버 (`API_PORT`, 기본 4000). CORS, pino 로깅, 메트릭 인터셉터, CSRF 미들웨어, ThrottlerGuard.
- `apps/api/src/worker.ts` — `NestFactory.createApplicationContext` 로 DI 컨테이너만 띄우고 HTTP 는 열지 않는다. BullMQ 워커가 여기서 돈다.

`AppModule` (`apps/api/src/app.module.ts`) 에 등록된 기능 모듈:

| 모듈                                              | 위치                           | 역할                                                         |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `MetricsModule`                                   | `metrics/`                     | prom-client 기반 `/metrics`                                  |
| `HealthController`                                | `health/`                      | `/healthz`                                                   |
| `AuthModule` + `OAuthModule`                      | `auth/`, `auth/oauth/`         | 세션/쿠키, Google·GitHub OAuth, 이메일 인증, 비밀번호 재설정 |
| `EmailModule`                                     | `email/`                       | 발신                                                         |
| `MeModule`                                        | `me/`                          | `/me`, 비밀번호 변경, 세션 목록                              |
| `ApiKeysModule`                                   | `api-keys/`                    | BYOK 키 등록·검증(argon2/AES)                                |
| `ProjectsModule` / `PagesModule` / `PanelsModule` | `projects/` `pages/` `panels/` | 작품 트리 CRUD                                               |
| `ConsistencyModule`                               | `consistency/`                 | 일관성 엔티티 + 참조 이미지 업로드                           |
| `RenderModule`                                    | `render/`                      | IR 빌더, BullMQ 큐, 워커, SSE 허브                           |
| `ExportModule`                                    | `export/`                      | 페이지 PNG/PDF 내보내기, 패널 알파 마스크 합성               |

지원 디렉토리: `common/` (예외 필터, Zod 파이프, 응답 envelope 인터셉터, CSRF, 업로드 유틸), `storage/` (S3/MinIO + 이미지 검증).

주요 의존성 (`apps/api/package.json`): `@nestjs/*`, `bullmq`, `ioredis`, `@aws-sdk/client-s3`, `sharp`, `argon2`, `prom-client`, `zod`, `ulid`, `nestjs-pino`. 워크스페이스 의존성으로 `@comicai/{types,db,adapters,events}` 를 모두 끌어다 쓴다.

테스트: vitest (단위 + `vitest.integration.config.ts` 의 testcontainers 통합).

### 4.2 `apps/web` — Next.js 15

`apps/web/package.json` 기준 Next 15 + React 18, App Router. 주요 라이브러리:

- `tldraw` 3 — 패널 캔버스
- `@tiptap/*` + `@tiptap/extension-mention` — 패널 텍스트/멘션
- `@tanstack/react-query` — API 캐시
- `@radix-ui/*`, `tailwindcss` + `tailwindcss-animate` — UI
- `@playwright/test` — E2E

라우트 구조 (`apps/web/app/`):

```
layout.tsx, page.tsx, providers.tsx, globals.css
login/, signup/, forgot-password/, reset-password/, verify-email/
dashboard/
settings/
health/
projects/
  page.tsx
  [id]/
    page.tsx
    pages/
    consistency/
```

컴포넌트 (`apps/web/components/`):

- `editor/` — `panel-editor.tsx`, `panel-inspector.tsx`, `panel-shape-picker.tsx`, `tool-toggle.tsx`, `tldraw/`, `mention-extension.ts`, `mention-suggestion.tsx`, `history-tray.tsx`, `save-status.tsx`, `export-dialog.tsx`, `page-sidebar.tsx`, `page-size-select.tsx`, `panel-status-badge.tsx`
- `consistency/`, `dashboard/`, `auth/`, `shell/`, `ui/`
- 최상위 `api-key-form.tsx`, `api-key-list.tsx`, `oauth-buttons.tsx`

`apps/web/lib/` 에는 fetch 래퍼(`api.ts`), 디바운스 훅, 테마, 프로젝트 훅 등이 있다.

웹은 API 와 정적 계약만 공유하므로 워크스페이스 의존성은 `@comicai/types` 하나다.

### 4.3 `packages/types`

API ↔ Web 사이의 단일 진실 소스.

- `src/index.ts` — `ModelProvider`, `ModelId`, `RENDER_STATUSES`, `ImageRef`/`AdapterImage`, `EntityType`/`ConsistencyEntityDTO`, `PanelShape*`/`PanelDTO`, `TipTapDoc`/`TipTapMentionAttrs`, `PageDTO`, `ProjectDTO`, `RenderIR`/`RenderJobDTO` 등.
- `src/envelope.ts` — 표준 응답 envelope.
- `src/schemas.ts` (+ `.spec.ts`) — zod 스키마.
- `src/paths.ts` — `API_PREFIX = '/v1'`, CSRF 쿠키/헤더 이름, `ApiPaths` 헬퍼 (`/projects`, `/pages/:id`, `/panels/:id/render`, `/render-jobs/:id/events` 등).
- `src/panel-path.ts` — 패널 모양 → SVG path 직렬화.

의존성은 `zod` 하나뿐.

### 4.4 `packages/db`

Prisma + ULID 유틸.

- `prisma/schema.prisma` — Postgres 16 대상. 모델: `User`, `EmailVerification`, `PasswordReset`, `ApiKey`, `Project`, `ConsistencyEntity`, `Page`, `Panel`, `RenderJob`.
- `prisma/migrations/` — 마이그레이션 히스토리.
- `src/ids.ts` — ULID 발급.
- `src/index.ts` — `PrismaClient` 재노출.

스크립트: `prisma generate` / `prisma migrate dev` / `prisma studio`.

### 4.5 `packages/events`

렌더 SSE 와이어 포맷.

- `src/index.ts` — `RenderSseEvent` 유니온(`status`/`error`/`ping`), `formatSseEvent`, `encode/decodePubSubEnvelope` (워커 → API 간 Redis pub/sub 봉투).
- `src/mention.ts` (+ `.spec.ts`) — TipTap 멘션 노드에서 엔티티 ID 해상, 이름 치환 직렬화.
- `src/sse.spec.ts` — SSE 포맷 테스트.

의존성은 `@comicai/types` 만.

### 4.6 `packages/adapters`

모델 추상화 계층.

- `src/index.ts` — `ModelAdapter` 인터페이스(`buildRequest`/`call`/`classifyError`)와 `ModelId → 어댑터` 레지스트리, `getAdapter()`, `availableModels()`.
- `src/mock.ts` — 실 API 없이 흐름 검증용.
- `src/gemini.ts` — Google Gemini.
- `src/openai.ts` — OpenAI.
- `src/priority.ts` — `selectReferences()` 참조 이미지 우선순위 선택.
- `src/_alias.ts` — 별칭/유틸.

워커에서 주입되는 `AdapterContext.loadReference` 가 storageKey 를 실제 바이트로 로드한다 (Storage 서비스 경유).

### 4.7 `infra/`

- `infra/compose/dev.yml` — 인프라(Postgres 16, Redis 7, MinIO)만 띄움. 앱은 호스트에서 `pnpm dev`. 포트는 PG 5433→5432, Redis 6379, MinIO 9000/9001.
- `infra/compose/full.yml` — 위 인프라 + `api`/`worker`/`web`/`migrate`/(optional) `cloudflared`/(optional) `backup` 까지 전부 컨테이너로. `MASTER_KEY` 가 필수 환경변수. `worker` 는 `RENDER_WORKER_DISABLED=0` + `node apps/api/dist/worker.js` 로 분리 기동. 백업/터널은 compose profile(`backup`, `tunnel`)로 옵트인.
- `infra/docker/api.Dockerfile`, `infra/docker/web.Dockerfile` — 빌드 이미지.
- `infra/backup/` — `backup.sh` + `entrypoint.sh` + `Dockerfile`. cron(`BACKUP_SCHEDULE`, 기본 `0 3 * * *`)으로 Postgres dump + MinIO 데이터를 보존(`BACKUP_RETENTION_DAYS`, 기본 14).

## 5. 컴포넌트 맵 (런타임)

```
┌──────────────────────┐        ┌──────────────────────────────┐
│   apps/web (Next 15) │        │       apps/api (Nest 10)     │
│   App Router         │        │  ┌─ HTTP (main.ts) ────────┐ │
│   tldraw + TipTap    │  HTTP  │  │ /v1/* + /healthz        │ │
│   react-query        │ <────> │  │ SSE: /render-jobs/:id/  │ │
│                      │ cookie │  │      events             │ │
│  port 3000           │  CSRF  │  └─────────────────────────┘ │
└──────────────────────┘        │  ┌─ Worker (worker.ts) ────┐ │
                                │  │ BullMQ render queue     │ │
                                │  │ adapters: mock/gemini/  │ │
                                │  │          openai         │ │
                                │  └─────────────────────────┘ │
                                │  port 4000                   │
                                └──────────────┬───────────────┘
                                               │
                ┌──────────────────────────────┼────────────────────────────┐
                │                              │                            │
        ┌───────▼────────┐           ┌─────────▼────────┐         ┌─────────▼─────────┐
        │ Postgres 16    │           │ Redis 7          │         │ MinIO (S3)        │
        │ Prisma         │           │ BullMQ + pub/sub │         │ images / exports  │
        │ host:5433      │           │ host:6379        │         │ host:9000 / 9001  │
        └────────────────┘           └──────────────────┘         └───────────────────┘
```

데이터 흐름 요지:

1. 웹이 패널 편집 결과를 `/v1/panels/:id` 로 저장하고, 렌더 트리거는 `/v1/panels/:id/render` (`packages/types/src/paths.ts`).
2. API `RenderModule` 이 `ir.builder.ts` 로 일관성 엔티티/참조 이미지/멘션 텍스트를 모아 `RenderIR` 을 만든 뒤 `render.queue.ts` 로 BullMQ enqueue.
3. 워커 프로세스의 `render.worker.ts` 가 어댑터를 호출, 상태 변화를 `packages/events` 의 pub/sub envelope 으로 Redis 에 발행.
4. 웹이 구독한 SSE 엔드포인트가 `sse.hub.ts` 에서 이를 받아 클라이언트로 중계. 결과 이미지는 MinIO 의 presigned URL 로 노출(`PanelDTO.currentRenderImageUrl` 등).
5. 페이지 단위 내보내기는 `ExportModule` 이 패널 알파 마스크(`panel-mask.ts`) 를 sharp 로 합성.

## 6. 참고 파일 빠른 인덱스

- 루트 설정: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- API 엔트리: `apps/api/src/main.ts`, `apps/api/src/worker.ts`, `apps/api/src/app.module.ts`
- 웹 엔트리: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/providers.tsx`
- 공유 계약: `packages/types/src/index.ts`, `packages/types/src/paths.ts`, `packages/types/src/envelope.ts`
- DB 스키마: `packages/db/prisma/schema.prisma`
- 어댑터 레지스트리: `packages/adapters/src/index.ts`
- SSE 와이어: `packages/events/src/index.ts`
- 로컬 인프라: `infra/compose/dev.yml`
- 전체 스택: `infra/compose/full.yml`
