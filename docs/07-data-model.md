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
        │ 1            Entity
        * Panel
        │ 1 (current_render_id, weak ref)
        * RenderJob (panel_id, 인덱스만)
```

- 모든 외래키는 `ON DELETE CASCADE` (`schema.prisma:40`, `:54`, `:71`, `:85`, `:105`, `:120`, `:137`, `:156`).
- `Panel.currentRenderId`와 `Panel.history`는 **FK가 아닌 약결합 참조** — RenderJob을 가리키는 단순 문자열입니다 (`schema.prisma:134`–135). RenderJob 쪽도 `panelId`만 갖고 Panel 관계가 없습니다 (`schema.prisma:144`, `:158`).

---

## 2. 엔티티 상세

### 2.1 User — `users` (`schema.prisma:12`)

| 필드                  | 타입                     | nullable | 기본값                 |
| --------------------- | ------------------------ | -------- | ---------------------- |
| id                    | String (PK)              | no       | —                      |
| email                 | String                   | no       | — (unique)             |
| passwordHash          | String                   | yes      | —                      |
| displayName           | String (`display_name`)  | yes      | —                      |
| avatarUrl             | String (`avatar_url`)    | yes      | —                      |
| oauthProviders        | Json (`oauth_providers`) | no       | `[]`                   |
| emailVerifiedAt       | DateTime                 | yes      | —                      |
| createdAt / updatedAt | DateTime                 | no       | `now()` / `@updatedAt` |

- Unique: `email` (`:14`).
- 관계: 1:N → ApiKey, Project, RenderJob, EmailVerification, PasswordReset.

### 2.2 EmailVerification — `email_verifications` (`schema.prisma:32`)

- 필드: id, userId, tokenHash (unique), expiresAt, usedAt?, createdAt.
- 인덱스: `@@index([userId])` (`:42`). 토큰은 `token_hash`만 저장.

### 2.3 PasswordReset — `password_resets` (`schema.prisma:46`)

- EmailVerification와 동일 구조 (`schema.prisma:46`–58). 토큰 해시 unique.

### 2.4 ApiKey — `api_keys` (`schema.prisma:60`)

| 필드               | 타입      | nullable | 비고                                                   |
| ------------------ | --------- | -------- | ------------------------------------------------------ |
| id                 | String PK | no       | —                                                      |
| userId             | String    | no       | FK→users (cascade)                                     |
| provider           | String    | no       | `'gemini' \| 'openai'` (Zod에서 enum, `schemas.ts:49`) |
| label              | String    | no       | —                                                      |
| ciphertext / nonce | String    | no       | KMS 봉투암호화 결과                                    |
| lastVerifiedAt     | DateTime  | yes      | —                                                      |
| isActive           | Boolean   | no       | `true`                                                 |
| createdAt          | DateTime  | no       | `now()`                                                |

- 인덱스: `@@index([userId])` (`:73`).

### 2.5 Project — `projects` (`schema.prisma:77`)

- 필드: id, userId, name, thumbnail?, createdAt, updatedAt.
- 인덱스: `@@index([userId, createdAt])` (`:89`).
- 관계: 1:N → Page, ConsistencyEntity.

### 2.6 ConsistencyEntity — `consistency_entities` (`schema.prisma:93`)

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

- 인덱스: `@@index([projectId, type])` (`:107`).

### 2.7 Page — `pages` (`schema.prisma:111`)

- 필드: id, projectId, order(Int), name?(String, P7B 추가), size(Json `{w,h}`), background?(Json `ImageRef`), createdAt.
- 인덱스: `@@index([projectId, order])` (`:123`).

### 2.8 Panel — `panels` (`schema.prisma:127`)

| 필드            | 타입      | nullable | 기본값                        |
| --------------- | --------- | -------- | ----------------------------- |
| id              | String PK | no       | —                             |
| pageId          | String    | no       | FK→pages                      |
| shape           | Json      | no       | `PanelShape` (아래 enum 참조) |
| conti           | Json      | yes      | `ImageRef` 또는 null          |
| text            | Json      | no       | `{}` — TipTap 문서            |
| refImages       | Json      | no       | `[]`                          |
| currentRenderId | String    | yes      | RenderJob 약결합 참조         |
| history         | String[]  | no       | `[]` — RenderJob id 목록      |

- 인덱스: `@@index([pageId])` (`:139`).

### 2.9 RenderJob — `render_jobs` (`schema.prisma:143`)

| 필드        | 타입                  | nullable | 비고                                       |
| ----------- | --------------------- | -------- | ------------------------------------------ |
| id          | String PK             | no       | —                                          |
| panelId     | String                | no       | **FK 없음**, 인덱스만                      |
| userId      | String                | no       | FK→users (cascade)                         |
| model       | String                | no       | `RenderModelSchema` enum (`schemas.ts:78`) |
| ir          | Json                  | no       | `RenderIR` (`index.ts:244`)                |
| status      | String                | no       | `RENDER_STATUSES` (`index.ts:13`)          |
| resultImage | Json (`result_image`) | yes      | `ImageRef`                                 |
| error       | Json                  | yes      | `RenderError` (`index.ts:222`)             |
| attempts    | Int                   | no       | `0`                                        |
| createdAt   | DateTime              | no       | `now()`                                    |
| finishedAt  | DateTime              | yes      | —                                          |

- 인덱스: `@@index([panelId, createdAt])`, `@@index([userId, createdAt])` (`:158`–159).

---

## 3. 중요 Enum / Union 상수

| 이름                        | 값                                                           | 출처                             |
| --------------------------- | ------------------------------------------------------------ | -------------------------------- |
| RENDER_STATUSES             | `queued, running, succeeded, failed, timeout, canceled`      | `packages/types/src/index.ts:13` |
| IN_PROGRESS_RENDER_STATUSES | `queued, running`                                            | `index.ts:22`                    |
| TERMINAL_RENDER_STATUSES    | `succeeded, failed, timeout, canceled`                       | `index.ts:23`                    |
| PANEL_SHAPE_TYPES           | `rect, rounded, oval, diamond, parallelogram, polygon`       | `index.ts:95`                    |
| PANEL_SHAPE_PRESETS         | `rect, rounded, oval, diamond, parallelogram` (polygon 제외) | `index.ts:106`                   |
| EntityType                  | `style, character, background, worldview`                    | `index.ts:72` / `schemas.ts:109` |
| ModelProvider               | `gemini, openai, mock`                                       | `index.ts:7`                     |
| ModelId                     | `gemini-3.1-flash-image-preview, gpt-image-2, mock`          | `index.ts:8`, `schemas.ts:78`    |
| OAUTH_PROVIDERS             | `google, github`                                             | `index.ts:10`                    |
| RenderErrorCategory         | `transient, auth, quota, safety, invalid, timeout`           | `index.ts:211`                   |

DB 컬럼은 모두 `String`이며, **타입 안전성은 Zod 스키마(`packages/types/src/schemas.ts`)와 TS union을 통해서만 강제**됩니다. PostgreSQL enum은 사용하지 않습니다.

---

## 4. DTO ↔ DB 매핑

| DB 모델                           | DTO / Zod              | 위치           | 형태 불일치 / 주의점                                                                                                                                                                       |
| --------------------------------- | ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User                              | `SessionUser`          | `index.ts:47`  | DTO에는 `passwordHash`, `emailVerifiedAt`, `createdAt`/`updatedAt` 없음. `oauthProviders`는 DB Json → DTO `('google'\|'github')[]`.                                                        |
| ApiKey                            | `ApiKeySummary`        | `index.ts:38`  | `ciphertext`/`nonce`는 DTO 미노출. `provider` DTO는 `ModelProvider`(mock 포함)이지만 Zod 생성 스키마(`ApiKeyCreateSchema`, `schemas.ts:47`)는 `'gemini'\|'openai'`만 허용 — 약간의 불일치. |
| Project                           | `ProjectDTO`           | `index.ts:172` | 일치.                                                                                                                                                                                      |
| ConsistencyEntity                 | `ConsistencyEntityDTO` | `index.ts:74`  | DB `refImages`(Json) → DTO `ImageRef[]`. DTO에 **`refImageUrls`(presigned URL 배열)** 가 추가됨 — 응답 직전에 생성되는 파생 필드.                                                          |
| Page                              | `PageDTO`              | `index.ts:155` | DB `size`(Json) → `{w,h}`. `name`은 nullable 동일. `pageLabel()` 헬퍼가 `name ?? p{order+1}` 라벨 산출 (`index.ts:167`).                                                                   |
| Panel                             | `PanelDTO`             | `index.ts:118` | DB `text`(Json) → `TipTapDoc`. DTO에는 **`currentRenderStatus`, `currentRenderImageUrl`** 가 추가됨 (RenderJob 조인 결과). DTO `conti`/`refImages`는 `ImageRef` 구조로 강타입.             |
| RenderJob                         | `RenderJobDTO`         | `index.ts:250` | DTO에 `ir` 필드 **없음** — IR은 워커 내부 데이터, 응답에 노출되지 않음. `model`은 DB String → DTO `ModelId`. `resultImageUrl`(presigned)은 history 엔드포인트에서만 채워짐.                |
| EmailVerification / PasswordReset | (DTO 없음)             | —              | 토큰은 hash만 저장, 외부 노출 없음.                                                                                                                                                        |

### Zod 입력 스키마 (생성/수정 페이로드)

- 인증: `CredentialsSchema`, `PasswordResetRequestSchema`, `PasswordResetConfirmSchema`, `PasswordChangeSchema` (`schemas.ts:16-35`).
- 프로필: `MePatchSchema` (`schemas.ts:39`).
- API Key 생성: `ApiKeyCreateSchema` (`schemas.ts:47`).
- 프로젝트: `ProjectCreateSchema`, `ProjectPatchSchema` (`schemas.ts:55-62`).
- 페이지: `PageCreateSchema`, `PagePatchSchema`, `PageSizeSchema` (`schemas.ts:64-76`).
- 패널: `PanelShapeSchema`(points 3–64), `PanelCreateSchema`, `PanelPatchSchema` (`schemas.ts:94-107`).
- 렌더: `RenderModelSchema`, `RenderStartSchema` (`schemas.ts:78-83`).
- 내보내기: `ExportFormatSchema`, `ExportRequestSchema` (`schemas.ts:86-91`).
- 일관성: `EntityTypeSchema`, `ConsistencyCreateSchema`, `ConsistencyPatchSchema` (`schemas.ts:109-120`).

### 미디어 공통

- `ImageRef` (`index.ts:56`): `{ storageKey, width, height, mimeType }` — DB `Json` 컬럼에 저장되는 표준 구조.
- `AdapterImage` (`index.ts:64`): 어댑터→워커 전달용 raw bytes (영속화되지 않음).

---

## 5. ID 정책 (`packages/db/src/ids.ts:1`)

- 형식: `<prefix>_<ULID>`.
- 접두사: `user, apikey, proj, page, panel, render, char, bg, style, world, evf, prt`.
- `entityIdPrefix(type)`로 ConsistencyEntity의 type → 접두사 매핑 (`ids.ts:21`).

---

## 6. 마이그레이션 목록

`packages/db/prisma/migrations/` — Prisma migrate 형식.

| 파일                                                 | 한 줄 요약                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `20260516034008_init/migration.sql`                  | 초기 스키마: users, api_keys, projects, consistency_entities, pages, panels, render_jobs 테이블 + FK/인덱스 생성.          |
| `20260516085126_p1_user_oauth_profile/migration.sql` | users에 `display_name`, `avatar_url`, `email_verified_at`, `oauth_providers`(JSONB) 컬럼 추가.                             |
| `20260516100128_p3_auth_tokens/migration.sql`        | `email_verifications`, `password_resets` 테이블 추가 (token_hash unique, user_id index, FK cascade).                       |
| `20260516141839_p7_page_name/migration.sql`          | `pages.name` (TEXT, nullable) 컬럼 추가 — 사용자 지정 페이지 라벨.                                                         |
| `20260517005900_p7_rename_model_ids/migration.sql`   | render_jobs.model 데이터 마이그레이션: `gemini-nano-banana → gemini-3.1-flash-image-preview`, `gpt-image-1 → gpt-image-2`. |

`migration_lock.toml`은 provider를 PostgreSQL로 고정합니다.

---

## 7. 알려진 주의사항 / 형태 불일치 요약

1. **Panel ↔ RenderJob FK 부재**: cascade 삭제가 자동 적용되지 않음. Page → Panel cascade는 작동하나 panel 삭제 시 render_jobs의 cleanup은 애플리케이션 레벨에서 처리해야 함.
2. **enum-like 컬럼이 모두 `String`**: DB 레벨 제약 없음. 잘못된 값이 들어가면 DTO 직렬화 시점에 타입 사기 발생 가능 — Zod 검증을 항상 거쳐야 안전.
3. **`ApiKey.provider` 범위 불일치**: DB는 자유 텍스트, Zod 생성 스키마는 `gemini|openai`, DTO `ApiKeySummary.provider`는 `ModelProvider`(mock 포함). 실사용 경로에서는 mock provider의 키를 만들 수 없으나, 타입은 허용.
4. **`Panel.history`는 String[]**: 순서 의미가 있음 (history 순). 별도 RenderHistory 테이블 없음.
5. **파생 필드는 DTO에만 존재**: `refImageUrls`, `currentRenderStatus`, `currentRenderImageUrl`, `resultImageUrl`은 모두 응답 직전에 채워지는 presigned URL/조인 필드이며 DB에는 없음.
6. **`text` 컬럼 기본값 `{}`** (`schema.prisma:132`): DTO `TipTapDoc`은 `{type:'doc', content:[...]}` 형태이므로 신규 패널 생성 시 `emptyDoc()` (`index.ts:150`)으로 정규화 필요.
