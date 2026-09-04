# 07 · 데이터 모델

ComicAI는 Prisma + PostgreSQL을 사용합니다. 스키마는 `packages/db/prisma/schema.prisma`에 정의되어 있고, 백엔드/프런트엔드가 공유하는 DTO/Zod 스키마는 `packages/types/src/`에 있습니다. ID 생성기는 `packages/db/src/ids.ts:1` (ULID + 접두사).

---

## 1. ER 개요 (ASCII)

```
                ┌──────────┐
                │  User    │ 1 ─┬─ * ApiKey
                └────┬─────┘    ├─ * EmailVerification
                     │ 1        ├─ * PasswordReset
                     │          └─ * RenderJob (소유자)
                     * Project
                     │ 1
        ┌────────────┼────────────┐
        * Page       * Consistency
        │ 1           Entity
        ├─ * Panel
        │       │ 1 (current_render_id, weak ref)
        │       * RenderJob (panel_id, 인덱스만)
        ├─ * SpeechBubble  (페이지 직속, 모양/선/채움만)
        ├─ * PageText      (페이지 직속, 자유 텍스트 박스)
        └─ * PageLine      (페이지 직속, 자유 직선)
```

- 모든 외래키는 `ON DELETE CASCADE` (`schema.prisma:41`, `:55`, `:72`, `:88`, `:108`, `:124`, `:144`, `:163`, `:182`, `:199`, `:218`).
- `Panel.currentRenderId`와 `Panel.history`는 **FK가 아닌 약결합 참조** — RenderJob을 가리키는 단순 문자열입니다 (`schema.prisma:195, 197`). RenderJob 쪽도 `panelId`만 갖고 Panel 관계가 없습니다 (`schema.prisma:207, 220`).

---

## 2. 엔티티 상세

### 2.1 User — `users` (`schema.prisma:12-31`)

| 필드                  | 타입                          | nullable | 기본값                                          |
| --------------------- | ----------------------------- | -------- | ----------------------------------------------- |
| id                    | String (PK)                   | no       | —                                               |
| email                 | String                        | no       | — (unique)                                      |
| passwordHash          | String                        | yes      | —                                               |
| displayName           | String (`display_name`)       | yes      | —                                               |
| avatarUrl             | String (`avatar_url`)         | yes      | —                                               |
| avatarStorageKey      | String (`avatar_storage_key`) | yes      | — (S3/MinIO 자체 업로드 아바타. presign에 사용) |
| oauthProviders        | Json (`oauth_providers`)      | no       | `[]`                                            |
| emailVerifiedAt       | DateTime                      | yes      | —                                               |
| createdAt / updatedAt | DateTime                      | no       | `now()` / `@updatedAt`                          |

- Unique: `email` (`:14`).
- 관계: 1:N → ApiKey, Project, RenderJob, EmailVerification, PasswordReset.

### 2.2 EmailVerification — `email_verifications` (`schema.prisma:33-45`)

- 필드: id, userId, tokenHash (unique), expiresAt, usedAt?, createdAt.
- 인덱스: `@@index([userId])` (`:43`). 토큰은 `token_hash`만 저장.

### 2.3 PasswordReset — `password_resets` (`schema.prisma:47-59`)

- EmailVerification와 동일 구조 (`schema.prisma:47-59`). 토큰 해시 unique.

### 2.4 ApiKey — `api_keys` (`schema.prisma:61-76`)

| 필드               | 타입      | nullable | 비고                                                      |
| ------------------ | --------- | -------- | --------------------------------------------------------- |
| id                 | String PK | no       | —                                                         |
| userId             | String    | no       | FK→users (cascade)                                        |
| provider           | String    | no       | `'gemini' \| 'openai'` (Zod에서 enum, `schemas.ts:50-54`) |
| label              | String    | no       | —                                                         |
| ciphertext / nonce | String    | no       | KMS 봉투암호화 결과                                       |
| lastVerifiedAt     | DateTime  | yes      | —                                                         |
| isActive           | Boolean   | no       | `true`                                                    |
| createdAt          | DateTime  | no       | `now()`                                                   |

- 인덱스: `@@index([userId])` (`:74`).

### 2.5 Project — `projects` (`schema.prisma:78-94`)

- 필드: id, userId, name, thumbnail?, defaultStyleId?, defaultModel?, createdAt, updatedAt.
- `defaultStyleId` (`schema.prisma:83`): 패널 렌더 시 자동 주입되는 대표 그림체 엔티티 id. **FK 없음** — ConsistencyEntity 삭제 시 정합성은 애플리케이션 레벨로 처리.
- `defaultModel` (`schema.prisma:84`): 패널 인스펙터에서 모델 select의 초기값으로 사용. 값은 `ModelId` 문자열. **enum 강제 없음** — 검증은 `ProjectPatchSchema` 의 `defaultModel` 필드(`schemas.ts:65-68`).
- 인덱스: `@@index([userId, createdAt])` (`:92`).
- 관계: 1:N → Page, ConsistencyEntity.

### 2.6 ConsistencyEntity — `consistency_entities` (`schema.prisma:96-112`)

| 필드                  | 타입                | nullable | 기본값                                                                            |
| --------------------- | ------------------- | -------- | --------------------------------------------------------------------------------- |
| id                    | String PK           | no       | —                                                                                 |
| projectId             | String              | no       | FK                                                                                |
| type                  | String              | no       | `'style' \| 'character' \| 'background' \| 'worldview'` (자유 텍스트, 검증은 Zod) |
| name                  | String              | no       | —                                                                                 |
| aliases               | String[]            | no       | `[]`                                                                              |
| description           | String              | no       | `""`                                                                              |
| refImages             | Json (`ref_images`) | no       | `[]` — `ImageRef[]`                                                               |
| version               | Int                 | no       | `1`                                                                               |
| createdAt / updatedAt | DateTime            | no       | —                                                                                 |

- 인덱스: `@@index([projectId, type])` (`:110`).

### 2.7 Page — `pages` (`schema.prisma:114-132`)

- 필드: id, projectId, order(Int), name?(String), size(Json `{w,h}`), background?(Json `ImageRef`), backgroundColor?(String, `#RRGGBB[AA]`), createdAt.
- `backgroundColor` (`schema.prisma:121`): 페이지 단색 배경. null이면 투명. `background` 이미지가 있을 땐 그 아래에 깔린다. 검증은 `PagePatchSchema.backgroundColor` (`schemas.ts:91-96`).
- 인덱스: `@@index([projectId, order])` (`:130`).
- 1:N 관계: Panel, SpeechBubble, PageText, PageLine (모두 cascade on Page 삭제).

### 2.8 SpeechBubble — `speech_bubbles` (`schema.prisma:134-148`)

페이지 직속(Page 1:N SpeechBubble). 패널과 독립이며 항상 패널 위 z-order로 렌더된다. **렌더 IR에는 영향 없음** — export 합성 단계에서만 SVG 오버레이로 합성된다(`apps/api/src/export/export.service.ts`, `apps/api/src/export/speech-bubble.render.ts`).

| 필드      | 타입      | nullable | 기본값                                                                                                                    |
| --------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| id        | String PK | no       | —                                                                                                                         |
| pageId    | String    | no       | FK→pages (cascade)                                                                                                        |
| variant   | String    | no       | `'ellipse' \| 'rect' \| 'spike' \| 'polygon'` (cloud/thought 는 2026-05-19 migration에서 제거되어 ellipse 로 일괄 변환됨) |
| shape     | Json      | no       | `SpeechBubbleShape` — `{x,y,w,h,points?,tail?}`                                                                           |
| style     | Json      | no       | `{}` — `SpeechBubbleStyle` (`strokeWidth/strokeColor/fillColor` 만 — 텍스트 키는 PageText 로 이전됨)                      |
| order     | Int       | no       | z-order 보조 카운터                                                                                                       |
| createdAt | DateTime  | no       | `now()`                                                                                                                   |
| updatedAt | DateTime  | no       | `@updatedAt`                                                                                                              |

- 인덱스: `@@index([pageId, order])` (`:146`).
- `text` 컬럼은 더 이상 존재하지 않는다 — 캔버스 위 텍스트는 [[page-text]] 오브젝트로 분리되었다.

### 2.9 PageText — `page_texts` (`schema.prisma:150-167`)

페이지 직속 자유 텍스트 박스 (만화 효과음·자막·내레이션 등). SpeechBubble 과 마찬가지로 export 단계에서 합성되며, 말풍선 위·PageLine 아래 레이어에 놓인다 (`apps/api/src/export/page-text.render.ts`).

| 필드      | 타입      | nullable | 기본값                                                         |
| --------- | --------- | -------- | -------------------------------------------------------------- |
| id        | String PK | no       | —                                                              |
| pageId    | String    | no       | FK→pages (cascade)                                             |
| x / y     | Float     | no       | 페이지 좌표계의 좌상단 위치                                    |
| w / h     | Float     | no       | 박스 너비/높이                                                 |
| text      | String    | no       | `""` — 단순 평문 (TipTap 사용 안 함, 줄바꿈만 보존)            |
| style     | Json      | no       | `{}` — `PageTextStyle` (`fontSize/fontFamily/color/textAlign`) |
| order     | Int       | no       | z-order 보조 카운터                                            |
| createdAt | DateTime  | no       | `now()`                                                        |
| updatedAt | DateTime  | no       | `@updatedAt`                                                   |

- 인덱스: `@@index([pageId, order])` (`:165`).
- DTO 매핑: `PageTextDTO` (`packages/types/src/index.ts:225-237`), 스타일 헬퍼 `defaultPageTextStyle()` (`index.ts:216-223`).

### 2.10 PageLine — `page_lines` (`schema.prisma:169-186`)

페이지 직속 자유 직선 (가이드선·말풍선 연결선·패널 구분선 등). 패널·렌더와 독립이며, export 단계에서 최상단(말풍선·PageText 위) 레이어로 합성된다 (`apps/api/src/export/page-line.render.ts`).

| 필드      | 타입      | nullable | 기본값                                                                            |
| --------- | --------- | -------- | --------------------------------------------------------------------------------- |
| id        | String PK | no       | —                                                                                 |
| pageId    | String    | no       | FK→pages (cascade)                                                                |
| x1 / y1   | Float     | no       | 시작점 (페이지 좌표계 절대값)                                                     |
| x2 / y2   | Float     | no       | 끝점 (페이지 좌표계 절대값)                                                       |
| style     | Json      | no       | `{}` — `PageLineStyle` (`strokeWidth/strokeColor/strokeStyle('solid'\|'dashed')`) |
| order     | Int       | no       | z-order 보조 카운터                                                               |
| createdAt | DateTime  | no       | `now()`                                                                           |
| updatedAt | DateTime  | no       | `@updatedAt`                                                                      |

- 인덱스: `@@index([pageId, order])` (`:184`).
- DTO 매핑: `PageLineDTO` (`packages/types/src/index.ts:259-270`), 스타일 헬퍼 `defaultPageLineStyle()` (`index.ts:251-257`).
- tldraw 측은 BaseBoxShape 패턴으로 표현: bbox(x/y/w/h) + bbox 내 두 끝점 normalized 좌표(x1Norm/y1Norm/x2Norm/y2Norm). DB ↔ shape 변환은 `apps/web/components/editor/tldraw/use-page-line-sync.ts`.

### 2.11 Panel — `panels` (`schema.prisma:188-203`)

| 필드            | 타입      | nullable | 기본값                                                                                           |
| --------------- | --------- | -------- | ------------------------------------------------------------------------------------------------ |
| id              | String PK | no       | —                                                                                                |
| pageId          | String    | no       | FK→pages                                                                                         |
| shape           | Json      | no       | `PanelShape` (아래 enum 참조)                                                                    |
| conti           | Json      | yes      | `ImageRef` 또는 null                                                                             |
| text            | Json      | no       | `{}` — TipTap 문서                                                                               |
| refImages       | Json      | no       | `[]`                                                                                             |
| currentRenderId | String    | yes      | RenderJob 약결합 참조                                                                            |
| styleId         | String    | yes      | 패널별 그림체 override(`schema.prisma:196`). null이면 `Project.defaultStyleId` 사용. **FK 없음** |
| history         | String[]  | no       | `[]` — RenderJob id 목록                                                                         |

- 인덱스: `@@index([pageId])` (`:201`).

### 2.12 RenderJob — `render_jobs` (`schema.prisma:205-223`)

| 필드        | 타입                  | nullable | 비고                                        |
| ----------- | --------------------- | -------- | ------------------------------------------- |
| id          | String PK             | no       | —                                           |
| panelId     | String                | no       | **FK 없음**, 인덱스만                       |
| userId      | String                | no       | FK→users (cascade)                          |
| model       | String                | no       | `RenderModelSchema` enum (`schemas.ts:105`) |
| ir          | Json                  | no       | `RenderIR` (`index.ts:426`)                 |
| status      | String                | no       | `RENDER_STATUSES` (`index.ts:26`)           |
| resultImage | Json (`result_image`) | yes      | `ImageRef`                                  |
| error       | Json                  | yes      | `RenderError` (`index.ts:402`)              |
| attempts    | Int                   | no       | `0`                                         |
| createdAt   | DateTime              | no       | `now()`                                     |
| finishedAt  | DateTime              | yes      | —                                           |

- 인덱스: `@@index([panelId, createdAt])`, `@@index([userId, createdAt])` (`:220-221`).

---

## 3. 중요 Enum / Union 상수

| 이름                        | 값                                                           | 출처                             |
| --------------------------- | ------------------------------------------------------------ | -------------------------------- |
| RENDER_STATUSES             | `queued, running, succeeded, failed, timeout, canceled`      | `packages/types/src/index.ts:26` |
| IN_PROGRESS_RENDER_STATUSES | `queued, running`                                            | `index.ts:35`                    |
| TERMINAL_RENDER_STATUSES    | `succeeded, failed, timeout, canceled`                       | `index.ts:36`                    |
| PANEL_SHAPE_TYPES           | `rect, rounded, oval, diamond, parallelogram, polygon`       | `index.ts:108`                   |
| PANEL_SHAPE_PRESETS         | `rect, rounded, oval, diamond, parallelogram` (polygon 제외) | `index.ts:119`                   |
| SPEECH_BUBBLE_VARIANTS      | `ellipse, rect, spike, polygon` (cloud/thought 제거됨)       | `index.ts:153`                   |
| PAGE_TEXT_FONT_FAMILIES     | `sans-serif, serif, monospace, Pretendard, Inter`            | `index.ts:183`                   |
| EntityType                  | `style, character, background, worldview`                    | `index.ts:85` / `schemas.ts:212` |
| ModelProvider               | `gemini, openai, mock`                                       | `index.ts:9`                     |
| ModelId                     | `gemini-3.1-flash-image-preview, gpt-image-2, mock`          | `index.ts:10`, `schemas.ts:105`  |
| OAUTH_PROVIDERS             | `google, github`                                             | `index.ts:23`                    |
| RenderErrorCategory         | `transient, auth, quota, safety, invalid, timeout`           | `index.ts:396`                   |
| PAGE_LINE_STROKE_STYLES     | `solid, dashed`                                              | `index.ts:242`                   |
| TEXT_ALIGNS                 | `left, center, right`                                        | `schemas.ts:4`                   |

DB 컬럼은 모두 `String`이며, **타입 안전성은 Zod 스키마(`packages/types/src/schemas.ts`)와 TS union을 통해서만 강제**됩니다. PostgreSQL enum은 사용하지 않습니다.

---

## 4. DTO ↔ DB 매핑

| DB 모델                           | DTO / Zod              | 위치           | 형태 불일치 / 주의점                                                                                                                                                                       |
| --------------------------------- | ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User                              | `SessionUser`          | `index.ts:60`  | DTO에는 `passwordHash`, `emailVerifiedAt`, `createdAt`/`updatedAt`, `avatarStorageKey` 없음. `oauthProviders`는 DB Json → DTO `('google'\|'github')[]`.                                    |
| ApiKey                            | `ApiKeySummary`        | `index.ts:51`  | `ciphertext`/`nonce`는 DTO 미노출. `provider` DTO는 `ModelProvider`(mock 포함)이지만 Zod 생성 스키마(`ApiKeyCreateSchema`, `schemas.ts:50`)는 `'gemini'\|'openai'`만 허용 — 약간의 불일치. |
| Project                           | `ProjectDTO`           | `index.ts:350` | `defaultStyleId` / `defaultModel` / `thumbnailUrl`(파생, presigned URL) 포함.                                                                                                              |
| ConsistencyEntity                 | `ConsistencyEntityDTO` | `index.ts:87`  | DB `refImages`(Json) → DTO `ImageRef[]`. DTO에 **`refImageUrls`(presigned URL 배열)** 가 추가됨 — 응답 직전에 생성되는 파생 필드.                                                          |
| Page                              | `PageDTO`              | `index.ts:329` | DB `size`(Json) → `{w,h}`. `name` 동일. `pageLabel()` 헬퍼가 `name ?? p{order+1}` 라벨 산출 (`index.ts:345-347`). 파생 필드: `backgroundUrl`(presign). `backgroundColor`는 동일 노출.      |
| SpeechBubble                      | `SpeechBubbleDTO`      | `index.ts:181` | DB에 `text` 컬럼 없음 — 텍스트는 [[page-text]] 로 분리됨. `style` 은 모양/선/채움 3필드만.                                                                                                 |
| PageText                          | `PageTextDTO`          | `index.ts:225` | DB 컬럼과 거의 1:1. style 은 `defaultPageTextStyle()` 머지로 정규화.                                                                                                                       |
| PageLine                          | `PageLineDTO`          | `index.ts:259` | DB 두 끝점 절대좌표(x1/y1/x2/y2) 와 1:1. tldraw 측은 bbox+normalized 좌표로 표현(`page-line-shape.tsx`). style 은 `defaultPageLineStyle()` 머지로 정규화.                                  |
| Panel                             | `PanelDTO`             | `index.ts:132` | DB `text`(Json) → `TipTapDoc`. DTO에는 **`currentRenderStatus`, `currentRenderImageUrl`, `contiUrl`** 가 추가됨 (presigned). DTO `conti`/`refImages`는 `ImageRef` 구조로 강타입.           |
| RenderJob                         | `RenderJobDTO`         | `index.ts:443` | DTO에 `ir` 필드 **없음** — IR은 워커 내부 데이터, 응답에 노출되지 않음. `model`은 DB String → DTO `ModelId`. `resultImageUrl`(presigned)은 history 엔드포인트에서만 채워짐.                |
| EmailVerification / PasswordReset | (DTO 없음)             | —              | 토큰은 hash만 저장, 외부 노출 없음.                                                                                                                                                        |

### Zod 입력 스키마 (생성/수정 페이로드)

- 인증: `CredentialsSchema`, `PasswordResetRequestSchema`, `PasswordResetConfirmSchema`, `PasswordChangeSchema` (`schemas.ts:19-35`).
- 프로필: `MePatchSchema` (`schemas.ts:42-45`).
- API Key 생성: `ApiKeyCreateSchema` (`schemas.ts:50-54`).
- 프로젝트: `ProjectCreateSchema`, `ProjectPatchSchema` (`schemas.ts:58-69`).
- 페이지: `PageCreateSchema`, `PagePatchSchema`, `PageSizeSchema`, `PageReorderSchema` (`schemas.ts:72-102`).
- 패널: `PanelShapeSchema`(points 3–64), `PanelCreateSchema`, `PanelPatchSchema` (`schemas.ts:122-134`).
- 말풍선: `SpeechBubbleVariantSchema`(4종), `SpeechBubbleShapeSchema`, `SpeechBubbleStyleSchema`(슬림), `SpeechBubbleCreateSchema`, `SpeechBubblePatchSchema`, `SpeechBubbleReorderSchema` (`schemas.ts:138-171`).
- 페이지 텍스트: `PageTextStyleSchema`, `PageTextCreateSchema`, `PageTextPatchSchema`, `PageTextReorderSchema` (`schemas.ts:182-209`).
- 페이지 직선: `PageLineStrokeStyleSchema`, `PageLineStyleSchema`, `PageLineCreateSchema`, `PageLinePatchSchema`, `PageLineReorderSchema` (`schemas.ts:212-241`).
- 렌더: `RenderModelSchema`, `RenderStartSchema` (`schemas.ts:105-110`).
- 내보내기: `ExportFormatSchema`, `ExportRequestSchema` (`schemas.ts:113-118`).
- 일관성: `EntityTypeSchema`, `ConsistencyCreateSchema`, `ConsistencyPatchSchema`, `ConsistencyGenerateSchema`, `ConsistencyAttachSchema` (`schemas.ts:242-260`).

### 미디어 공통

- `ImageRef` (`index.ts:75`): `{ storageKey, width, height, mimeType }` — DB `Json` 컬럼에 저장되는 표준 구조.
- `AdapterImage` (`index.ts:83`): 어댑터→워커 전달용 raw bytes (영속화되지 않음).

---

## 5. ID 정책 (`packages/db/src/ids.ts:1`)

- 형식: `<prefix>_<ULID>`.
- 접두사: `user, apikey, proj, page, panel, render, char, bg, style, world, evf, prt, bubble, ptext, pline` (`ids.ts:3-18`).
- `entityIdPrefix(type)`로 ConsistencyEntity의 type → 접두사 매핑 (`ids.ts:24-35`).

---

## 6. 마이그레이션 목록

`packages/db/prisma/migrations/` — Prisma migrate 형식.

| 파일                                                               | 한 줄 요약                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260516034008_init/migration.sql`                                | 초기 스키마: users, api_keys, projects, consistency_entities, pages, panels, render_jobs 테이블 + FK/인덱스 생성.                           |
| `20260516085126_p1_user_oauth_profile/migration.sql`               | users에 `display_name`, `avatar_url`, `email_verified_at`, `oauth_providers`(JSONB) 컬럼 추가.                                              |
| `20260516100128_p3_auth_tokens/migration.sql`                      | `email_verifications`, `password_resets` 테이블 추가 (token_hash unique, user_id index, FK cascade).                                        |
| `20260516141839_p7_page_name/migration.sql`                        | `pages.name` (TEXT, nullable) 컬럼 추가 — 사용자 지정 페이지 라벨.                                                                          |
| `20260517005900_p7_rename_model_ids/migration.sql`                 | render_jobs.model 데이터 마이그레이션: `gemini-nano-banana → gemini-3.1-flash-image-preview`, `gpt-image-1 → gpt-image-2`.                  |
| `20260517120000_p8_style_id/migration.sql`                         | `projects.default_style_id`, `panels.style_id` (둘 다 TEXT nullable) 추가 — 그림체 자동 주입. FK 없음.                                      |
| `20260517160000_p8_default_model/migration.sql`                    | `projects.default_model` (TEXT nullable) 추가 — 인스펙터 모델 select 기본값.                                                                |
| `20260517180000_p9_page_background_color/migration.sql`            | `pages.background_color` (TEXT nullable) 추가 — 단색 배경.                                                                                  |
| `20260517190000_p9_user_avatar_storage_key/migration.sql`          | `users.avatar_storage_key` (TEXT nullable) 추가 — 자체 업로드 아바타의 storageKey.                                                          |
| `20260517200000_speech_bubble/migration.sql`                       | `speech_bubbles` 테이블 추가 (variant/shape/text/style/order, FK cascade, `(page_id, order)` 인덱스).                                       |
| `20260519000000_cleanup_speech_bubble_add_page_text/migration.sql` | SpeechBubble 슬림화(`text` 컬럼 삭제, variant `cloud/thought` → `ellipse` 일괄 변환, style JSON 텍스트 키 제거) + `page_texts` 테이블 신설. |
| `20260524000000_page_line/migration.sql`                           | `page_lines` 테이블 신설 (두 끝점 x1/y1/x2/y2 + style JSON + order). Page cascade.                                                          |

`migration_lock.toml`은 provider를 PostgreSQL로 고정합니다.

---

## 7. 알려진 주의사항 / 형태 불일치 요약

1. **Panel ↔ RenderJob FK 부재**: cascade 삭제가 자동 적용되지 않음. Page → Panel cascade는 작동하나 panel 삭제 시 render_jobs의 cleanup은 애플리케이션 레벨에서 처리해야 함.
2. **enum-like 컬럼이 모두 `String`**: DB 레벨 제약 없음. 잘못된 값이 들어가면 DTO 직렬화 시점에 타입 사기 발생 가능 — Zod 검증을 항상 거쳐야 안전.
3. **`ApiKey.provider` 범위 불일치**: DB는 자유 텍스트, Zod 생성 스키마는 `gemini|openai`, DTO `ApiKeySummary.provider`는 `ModelProvider`(mock 포함). 실사용 경로에서는 mock provider의 키를 만들 수 없으나, 타입은 허용.
4. **`Panel.history`는 String[]**: 순서 의미가 있음 (history 순). 별도 RenderHistory 테이블 없음.
5. **파생 필드는 DTO에만 존재**: `refImageUrls`, `currentRenderStatus`, `currentRenderImageUrl`, `contiUrl`, `resultImageUrl`, `thumbnailUrl`, `backgroundUrl`은 모두 응답 직전에 채워지는 presigned URL/조인 필드이며 DB에는 없음.
6. **`text` 컬럼 기본값 `{}`** (`schema.prisma:193`): DTO `TipTapDoc`은 `{type:'doc', content:[...]}` 형태이므로 신규 패널 생성 시 `emptyDoc()` (`index.ts:289-291`)으로 정규화 필요.
7. **`Project.defaultStyleId` / `Panel.styleId` / `Project.defaultModel` FK·enum 부재**(`schema.prisma:83, 84, 176`): 셋 다 외부 참조이나 FK/enum 강제 없음. 엔티티 삭제·모델 ID 변경 시 dangling 값이 남을 수 있으며 cleanup·정합성은 애플리케이션 레벨에서 처리. `ir.builder.ts` 의 effectiveStyleId 결정 로직과 함께 본다.
8. **SpeechBubble.text 제거**(2026-05-19 migration): 캔버스 텍스트는 [[page-text]] (`page_texts` 테이블)로 이전. 옛 클라이언트가 SpeechBubble.text 를 PATCH 로 보내도 백엔드 스키마(`SpeechBubblePatchSchema`)가 거부한다.
