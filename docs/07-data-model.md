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
        │       * RenderJob (panel_id FK, cascade)
        ├─ * SpeechBubble  (페이지 직속, 모양/선/채움만)
        ├─ * PageText      (페이지 직속, 자유 텍스트 박스)
        └─ * PageLine      (페이지 직속, 자유 직선)
```

- 모든 외래키는 `ON DELETE CASCADE` (`schema.prisma:48`, `:62`, `:79`, `:95`, `:115`, `:131`, `:151`, `:170`, `:189`, `:215`, `:235`, `:241`).
- **`RenderJob.panelId` 는 FK 다**(`schema.prisma:241`, cascade). 예전에는 인덱스만 있어서 컷을
  지우면 `panels` 행만 사라지고 그 컷의 잡 수십 건이 영구히 남았다 — 프로젝트를 지워도 같았다
  (cascade 가 pages→panels 에서 끝난다). 저장소에 `renderJob.delete`/`deleteMany` 호출이
  **0건**이라 이 cascade 말고는 잡을 수거할 경로가 없다.
- `Panel.currentRenderId`와 `Panel.history`는 **FK가 아닌 약결합 참조** — RenderJob을 가리키는
  단순 문자열입니다 (`schema.prisma:211, 213`). `currentRenderId` 에 FK 를 걸지 않는 것은
  의도적이다: `RenderJob.panelId` 가 이미 `panels` 를 참조하므로 순환이 되고, 그 순환에서
  cascade 삭제 순서가 미묘해진다. 잡이 사라지는 경로가 컷 삭제 cascade 하나뿐이라 컷이 살아
  있는 동안 이 값은 dangling 될 수 없고, 읽는 쪽(`panels.service.ts:223`)도 잡이 없으면
  null 로 흡수한다.

---

## 2. 엔티티 상세

### 2.1 User — `users` (`schema.prisma:40-63`)

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

### 2.2 EmailVerification — `email_verifications` (`schema.prisma:54-66`)

- 필드: id, userId, tokenHash (unique), expiresAt, usedAt?, createdAt.
- 인덱스: `@@index([userId])` (`:43`). 토큰은 `token_hash`만 저장.

### 2.3 PasswordReset — `password_resets` (`schema.prisma:68-80`)

- EmailVerification와 동일 구조 (`schema.prisma:68-80`). 토큰 해시 unique.

### 2.4 ApiKey — `api_keys` (`schema.prisma:85-100`)

| 필드               | 타입      | nullable | 비고                                                      |
| ------------------ | --------- | -------- | --------------------------------------------------------- |
| id                 | String PK | no       | —                                                         |
| userId             | String    | no       | FK→users (cascade)                                        |
| provider           | String    | no       | `'gemini' \| 'openai'` (Zod에서 enum, `schemas.ts:78-82`) |
| label              | String    | no       | —                                                         |
| ciphertext / nonce | String    | no       | KMS 봉투암호화 결과                                       |
| lastVerifiedAt     | DateTime  | yes      | —                                                         |
| isActive           | Boolean   | no       | `true`                                                    |
| createdAt          | DateTime  | no       | `now()`                                                   |

- 인덱스: `@@index([userId])` (`:74`).

### 2.5 Project — `projects` (`schema.prisma:85-101`)

- 필드: id, userId, name, thumbnail?, defaultStyleId?, defaultModel?, createdAt, updatedAt.
- `defaultStyleId` (`schema.prisma:93`): 패널 렌더 시 자동 주입되는 대표 그림체 엔티티 id. **FK 없음** — ConsistencyEntity 삭제 시 정합성은 애플리케이션 레벨로 처리.
- `defaultModel` (`schema.prisma:94`): 패널 인스펙터에서 모델 select의 초기값으로 사용. 값은 `ModelId` 문자열. **enum 강제 없음** — 검증은 `ProjectPatchSchema` 의 `defaultModel` 필드(`schemas.ts:102`).
- 인덱스: `@@index([userId, createdAt])` (`:92`).
- 관계: 1:N → Page, ConsistencyEntity.

### 2.6 ConsistencyEntity — `consistency_entities` (`schema.prisma:121-137`)

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

### 2.7 Page — `pages` (`schema.prisma:121-139`)

- 필드: id, projectId, order(Int), name?(String), size(Json `{w,h}`), background?(Json `ImageRef`), backgroundColor?(String, `#RRGGBB[AA]`), createdAt.
- `backgroundColor` (`schema.prisma:131`): 페이지 단색 배경. null이면 투명. `background` 이미지가 있을 땐 그 아래에 깔린다. 검증은 `PagePatchSchema.backgroundColor` (`schemas.ts:147-151`).
- `size` 는 한 변이 `MAX_PAGE_DIMENSION`(4096) 이하여야 한다 (`schemas.ts:109`). 취향이 아니라
  **메모리 상한**이다 — export 가 이 값으로 sharp 캔버스를 잡으므로, 상한 없이 저장된 거대 페이지
  하나가 export 프로세스를 죽이고 같은 컨테이너의 다른 요청까지 끊는다.
  이미 저장된 행을 위해 export 쪽에도 클램프가 있다 (`apps/api/src/export/export.service.ts:211`).
- 인덱스: `@@index([projectId, order])` (`:130`).
- 1:N 관계: Panel, SpeechBubble, PageText, PageLine (모두 cascade on Page 삭제).

### 2.8 SpeechBubble — `speech_bubbles` (`schema.prisma:157-171`)

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

### 2.9 PageText — `page_texts` (`schema.prisma:176-193`)

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
- DTO 매핑: `PageTextDTO` (`packages/types/src/index.ts:268-288`), 스타일 헬퍼 `defaultPageTextStyle()` (`index.ts:259-266`).

### 2.10 PageLine — `page_lines` (`schema.prisma:195-212`)

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
- DTO 매핑: `PageLineDTO` (`packages/types/src/index.ts:302-322`), 스타일 헬퍼 `defaultPageLineStyle()` (`index.ts:294-300`).
- tldraw 측은 BaseBoxShape 패턴으로 표현: bbox(x/y/w/h) + bbox 내 두 끝점 normalized 좌표(x1Norm/y1Norm/x2Norm/y2Norm). DB ↔ shape 변환은 `apps/web/components/editor/tldraw/use-page-line-sync.ts`.

### 2.11 Panel — `panels` (`schema.prisma:198-219`)

| 필드            | 타입      | nullable | 기본값                                                                                           |
| --------------- | --------- | -------- | ------------------------------------------------------------------------------------------------ |
| id              | String PK | no       | —                                                                                                |
| pageId          | String    | no       | FK→pages                                                                                         |
| order           | Int       | no       | `0` — 페이지 안 앞뒤 순서                                                                        |
| shape           | Json      | no       | `PanelShape` (아래 enum 참조)                                                                    |
| conti           | Json      | yes      | `ImageRef` 또는 null                                                                             |
| text            | Json      | no       | `{}` — TipTap 문서                                                                               |
| refImages       | Json      | no       | `[]`                                                                                             |
| currentRenderId | String    | yes      | RenderJob 약결합 참조                                                                            |
| styleId         | String    | yes      | 패널별 그림체 override(`schema.prisma:206`). null이면 `Project.defaultStyleId` 사용. **FK 없음** |
| history         | String[]  | no       | `[]` — RenderJob id 목록                                                                         |

- 인덱스: `@@index([pageId, order])` (`:216`).
- `order` 는 나중에 붙었다(`migrations/20260904160000_panel_order`). 없을 때는 `list()` 의
  `findMany` 에 `orderBy` 가 아예 없어서 Postgres 힙 순서가 그대로 나갔고, 그 순서는
  UPDATE(이동·렌더 완료)마다 바뀔 수 있었다 — **겹쳐 둔 컷이 새로고침마다 앞뒤가
  뒤바뀌었다.** 말풍선·텍스트·직선은 처음부터 이 컬럼이 있었다. 재정렬 API 는 아직 없다.

### 2.12 RenderJob — `render_jobs` (`schema.prisma:222-247`)

| 필드        | 타입                  | nullable | 비고                                        |
| ----------- | --------------------- | -------- | ------------------------------------------- |
| id          | String PK             | no       | —                                           |
| panelId     | String                | no       | FK→panels (cascade, `schema.prisma:241`)    |
| userId      | String                | no       | FK→users (cascade)                          |
| model       | String                | no       | `RenderModelSchema` enum (`schemas.ts:160`) |
| ir          | Json                  | no       | `RenderIR` (`index.ts:486`)                 |
| status      | String                | no       | `RENDER_STATUSES` (`index.ts:73`)           |
| resultImage | Json (`result_image`) | yes      | `ImageRef`                                  |
| error       | Json                  | yes      | `RenderError` (`index.ts:467`)              |
| attempts    | Int                   | no       | `0`                                         |
| createdAt   | DateTime              | no       | `now()`                                     |
| finishedAt  | DateTime              | yes      | —                                           |

- 인덱스: `@@index([panelId, createdAt])`, `@@index([userId, createdAt])` (`:220-221`).

---

### 2.13 TokenAccount — `token_accounts` (`schema.prisma:258-269`)

| 필드      | 타입     | nullable | 비고                       |
| --------- | -------- | -------- | -------------------------- |
| userId    | String   | —        | PK 이자 FK. 사용자당 한 행 |
| balance   | Int      | —        | 기본 0                     |
| updatedAt | DateTime | —        |                            |

**`token_ledger` 의 amount 합과 항상 같아야 한다.** 합을 매번 세지 않는 이유는 읽기
성능도 있지만, 더 중요한 것은 이 행이 **동시성 통제 지점**이라는 것이다. 차감은
`UPDATE … WHERE balance >= ?` 한 문장이고 그 조건이 곧 "잔액보다 많이 쓸 수 없다" 는
보장이다 — 애플리케이션에서 읽고-검사하고-쓰면 동시에 들어온 두 요청이 같은 잔액을 읽어
둘 다 통과한다. 자세한 것은 `docs/02-backend.md` §3.12.

행은 첫 적립 때 생긴다(upsert). 없으면 잔액 0 이다.

### 2.14 TokenLedger — `token_ledger` (`schema.prisma:271-311`)

| 필드           | 타입     | nullable | 비고                                       |
| -------------- | -------- | -------- | ------------------------------------------ |
| id             | String   | —        | `tkl_` + ULID                              |
| userId         | String   | —        | FK cascade                                 |
| amount         | Int      | —        | 양수 적립, 음수 차감                       |
| balanceAfter   | Int      | —        | 이 항목 직후 잔액                          |
| kind           | String   | —        | `TOKEN_LEDGER_KINDS` 6종                   |
| idempotencyKey | String?  | O        | **unique.** 같은 사건의 이중 기록을 막는다 |
| memo           | String?  | O        | 사람이 읽는 사유                           |
| refId          | String?  | O        | 렌더 잡 id·주문 id                         |
| createdAt      | DateTime | —        | `@@index([userId, createdAt])`             |

추가만 하고 고치거나 지우지 않는다. 잔액이 틀렸을 때 되짚을 수 있는 유일한 근거이고,
사용자에게 보여 주는 내역이기도 하다.

`balanceAfter` 를 저장하는 이유는 내역 화면이 페이지 단위로 읽어 누적합을 다시 계산할 수
없기 때문이다. 차감과 같은 트랜잭션의 `UPDATE … RETURNING` 에서 받은 값이라 경쟁
상태에서도 실제 순서와 어긋나지 않는다.

`idempotencyKey` 규칙: 렌더 차감 `render:{jobId}`, 환급 `refund:{jobId}`, 구매
`order:{orderId}`, 가입 지급 `signup:{userId}`. 운영자 지급·회수만 키가 없다 — 같은
사유로 두 번 지급하는 것이 **의도된 경우**가 있고, 자동 재시도가 없는 유일한 경로다.

### 2.15 TokenOrder — `token_orders` (`schema.prisma:313-352`)

| 필드          | 타입      | nullable | 비고                                         |
| ------------- | --------- | -------- | -------------------------------------------- |
| id            | String    | —        | `ord_` + ULID                                |
| userId        | String    | —        | FK cascade                                   |
| packageId     | String    | —        | 주문 시점의 패키지 id                        |
| tokens        | Int       | —        | 주문 시점 값을 **복사**                      |
| amountKrw     | Int       | —        | 주문 시점 값을 **복사**                      |
| depositorName | String?   | O        | 통장에 찍힐 이름                             |
| status        | String    | —        | pending / paid / canceled / failed           |
| provider      | String    | —        | 지금은 `manual` 하나                         |
| providerRef   | String?   | O        | PG 식별자·입금 메모                          |
| createdAt     | DateTime  | —        | `@@index([userId, createdAt])`, `([status])` |
| paidAt        | DateTime? | O        |                                              |

**수량과 금액을 복사해 두는 이유**: 패키지 표(`TOKEN_PACKAGES`)를 참조만 하면 가격을
올리는 순간 옛 주문의 금액이 함께 바뀌어 영수증이 거짓말이 된다.

`depositorName` 은 대사(對査)의 실제 축이다. 한국 계좌이체에서 입금자명은 가입 이메일과
아무 관계가 없고(가족·회사 명의), 같은 날 두 사람이 같은 패키지를 사면 금액으로도 구분이
안 된다. `providerRef` 는 처리한 **뒤에** 남기는 값이라 이 문제를 풀지 못한다.

## 3. 중요 Enum / Union 상수

| 이름                        | 값                                                      | 출처                             |
| --------------------------- | ------------------------------------------------------- | -------------------------------- |
| RENDER_STATUSES             | `queued, running, succeeded, failed, timeout, canceled` | `packages/types/src/index.ts:73` |
| IN_PROGRESS_RENDER_STATUSES | `queued, running`                                       | `index.ts:89`                    |
| TERMINAL_RENDER_STATUSES    | `succeeded, failed, timeout, canceled`                  | `index.ts:55`                    |
| PANEL_SHAPE_TYPES           | `rect, rounded, oval, diamond, parallelogram, polygon`  | `schemas.ts:196`                 |
| SPEECH_BUBBLE_VARIANTS      | `ellipse, rect, spike, polygon` (cloud/thought 제거됨)  | `schemas.ts:239`                 |
| PAGE_TEXT_FONT_FAMILIES     | `sans-serif, serif, monospace`                          | `schemas.ts:274`                 |
| EntityType                  | `style, character, background, worldview`               | `schemas.ts:366`                 |
| ModelProvider               | `gemini, openai, mock`                                  | `index.ts:9`                     |
| ModelId                     | `gemini-3.1-flash-image-preview, gpt-image-2, mock`     | `schemas.ts:92`                  |
| OAUTH_PROVIDERS             | `google, github`                                        | `index.ts:23`                    |
| RenderErrorCategory         | `transient, auth, quota, safety, invalid, timeout`      | `index.ts:396`                   |
| PAGE_LINE_STROKE_STYLES     | `solid, dashed`                                         | `schemas.ts:310`                 |
| TEXT_ALIGNS                 | `left, center, right`                                   | `schemas.ts:4`                   |

**값 목록은 전부 `schemas.ts` 에만 있다.** `index.ts` 는 타입만 파생시킨다
(`ModelId` `index.ts:22`, `EntityType` `:149`). 예전에는 같은 문자열이 두세 곳에 적혀 있었고,
`index.ts` 의 지역 선언이 `export * from './schemas'` 를 가리기 때문에 **컴파일 에러 없이**
소비자와 Zod 검증기가 다른 목록을 볼 수 있었다 — 폰트 목록에서 실제로 일어난 일이다.
`RENDER_STATUSES` 의 두 부분집합은 `satisfies` 로 묶이고, "빠짐없이 덮는가" 는
`constants.spec.ts` 가 검사한다.

DB 컬럼은 모두 `String`이며, **타입 안전성은 Zod 스키마(`packages/types/src/schemas.ts`)와 TS union을 통해서만 강제**됩니다. PostgreSQL enum은 사용하지 않습니다.

---

## 4. DTO ↔ DB 매핑

| DB 모델                           | DTO / Zod              | 위치           | 형태 불일치 / 주의점                                                                                                                                                                          |
| --------------------------------- | ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                              | `SessionUser`          | `index.ts:60`  | DTO에는 `passwordHash`, `emailVerifiedAt`, `createdAt`/`updatedAt`, `avatarStorageKey` 없음. `oauthProviders`는 DB Json → DTO `('google'\|'github')[]`.                                       |
| ApiKey                            | `ApiKeySummary`        | `index.ts:51`  | `ciphertext`/`nonce`는 DTO 미노출. `provider` DTO는 `ModelProvider`(mock 포함)이지만 Zod 생성 스키마(`ApiKeyCreateSchema`, `schemas.ts:77`)는 `'gemini'\|'openai'`만 허용 — 약간의 불일치.    |
| Project                           | `ProjectDTO`           | `index.ts:350` | `defaultStyleId` / `defaultModel` / `thumbnailUrl`(파생, presigned URL) 포함.                                                                                                                 |
| ConsistencyEntity                 | `ConsistencyEntityDTO` | `index.ts:87`  | DB `refImages`(Json) → DTO `ImageRef[]`. DTO에 **`refImageUrls`(presigned URL 배열)** 가 추가됨 — 응답 직전에 생성되는 파생 필드.                                                             |
| Page                              | `PageDTO`              | `index.ts:329` | DB `size`(Json) → `{w,h}`. `name` 동일. `pageLabel()` 헬퍼가 `name ?? '페이지 {order+1}'` 라벨 산출 (`index.ts:385-389`). 파생 필드: `backgroundUrl`(presign). `backgroundColor`는 동일 노출. |
| SpeechBubble                      | `SpeechBubbleDTO`      | `index.ts:181` | DB에 `text` 컬럼 없음 — 텍스트는 [[page-text]] 로 분리됨. `style` 은 모양/선/채움 3필드만.                                                                                                    |
| PageText                          | `PageTextDTO`          | `index.ts:228` | DB 컬럼과 거의 1:1. style 은 `defaultPageTextStyle()` 머지로 정규화.                                                                                                                          |
| PageLine                          | `PageLineDTO`          | `index.ts:262` | DB 두 끝점 절대좌표(x1/y1/x2/y2) 와 1:1. tldraw 측은 bbox+normalized 좌표로 표현(`page-line-shape.tsx`). style 은 `defaultPageLineStyle()` 머지로 정규화.                                     |
| Panel                             | `PanelDTO`             | `index.ts:132` | DB `text`(Json) → `TipTapDoc`. DTO에는 **`currentRenderStatus`, `currentRenderImageUrl`, `contiUrl`** 가 추가됨 (presigned). DTO `conti`/`refImages`는 `ImageRef` 구조로 강타입.              |
| RenderJob                         | `RenderJobDTO`         | `index.ts:443` | DTO에 `ir` 필드 **없음** — IR은 워커 내부 데이터, 응답에 노출되지 않음. `model`은 DB String → DTO `ModelId`. `resultImageUrl`(presigned)은 history 엔드포인트에서만 채워짐.                   |
| EmailVerification / PasswordReset | (DTO 없음)             | —              | 토큰은 hash만 저장, 외부 노출 없음.                                                                                                                                                           |

### Zod 입력 스키마 (생성/수정 페이로드)

- 인증: `CredentialsSchema`, `PasswordResetRequestSchema`, `PasswordResetConfirmSchema`, `PasswordChangeSchema` (`schemas.ts:34-62`).
- 프로필: `MePatchSchema` (`schemas.ts:69-72`).
- API Key 생성: `ApiKeyCreateSchema` (`schemas.ts:78-82`).
- 프로젝트: `ProjectCreateSchema`, `ProjectPatchSchema` (`schemas.ts:85-96`).
- 페이지: `PageCreateSchema`, `PagePatchSchema`(`order` 없음 — 순서는 재정렬 전용), `PageSizeSchema`(한 변 4096 상한), `PageReorderSchema` (`schemas.ts:99-157`).
- 패널: `PanelShapeSchema`(points 3–64, 좌표 ±8192), `PanelCreateSchema`, `PanelPatchSchema` (`schemas.ts:215-248`).
  `PanelPatchSchema` 는 `shape`(전체 교체)와 `stroke`(테두리만) 두 갈래를 받는다. 인스펙터는
  **반드시 `stroke` 를 쓴다** — `shape` 전체를 보내면 선택 시점의 낡은 좌표까지 함께 써서,
  컷을 옮긴 직후 색을 바꾸면 이동이 취소된다. 좌표는 캔버스만 쓴다.
- 말풍선: `SpeechBubbleVariantSchema`(4종), `SpeechBubbleShapeSchema`, `SpeechBubbleStyleSchema`(슬림), `SpeechBubbleCreateSchema`, `SpeechBubblePatchSchema`, `SpeechBubbleReorderSchema` (`schemas.ts:250-292`).
- 페이지 텍스트: `PageTextStyleSchema`, `PageTextCreateSchema`, `PageTextPatchSchema`, `PageTextReorderSchema` (`schemas.ts:309-340`).
- 페이지 직선: `PageLineStrokeStyleSchema`, `PageLineStyleSchema`, `PageLineCreateSchema`, `PageLinePatchSchema`, `PageLineReorderSchema` (`schemas.ts:344-374`).
- 렌더: `RenderModelSchema`, `RenderStartSchema` (`schemas.ts:176-182`).
- 내보내기: `ExportFormatSchema`, `ExportRequestSchema` (`schemas.ts:184-190`).
- 일관성: `EntityTypeSchema`, `ConsistencyCreateSchema`, `ConsistencyPatchSchema`, `ConsistencyGenerateSchema`, `ConsistencyAttachSchema` (`schemas.ts:377-396`).

### 미디어 공통

- `ImageRef` (`index.ts:133`): `{ storageKey, width, height, mimeType }` — DB `Json` 컬럼에 저장되는 표준 구조.
- `AdapterImage` (`index.ts:141`): 어댑터→워커 전달용 raw bytes (영속화되지 않음).

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
| `20260905000000_render_job_panel_fk/migration.sql`                 | `render_jobs.panel_id` 에 FK+cascade 추가. **붙이기 전에 고아 행을 삭제한다** — 속한 컷이 이미 사라져 앱에서 도달할 수 없는 행이다.         |

`migration_lock.toml`은 provider를 PostgreSQL로 고정합니다.

---

## 7. 알려진 주의사항 / 형태 불일치 요약

1. **`Panel.currentRenderId`/`history` 는 여전히 약결합**: RenderJob → Panel 방향은 이제 FK+cascade 지만(`schema.prisma:241`), 반대 방향은 순환을 피하려고 문자열로 둔다. cascade 가 잡을 먼저 지우는 경로가 없어 dangling 은 생기지 않는다.
2. **enum-like 컬럼이 모두 `String`**: DB 레벨 제약 없음. 잘못된 값이 들어가면 DTO 직렬화 시점에 타입 사기 발생 가능 — Zod 검증을 항상 거쳐야 안전.
3. **`ApiKey.provider` 범위 불일치**: DB는 자유 텍스트, Zod 생성 스키마는 `gemini|openai`, DTO `ApiKeySummary.provider`는 `ModelProvider`(mock 포함). 실사용 경로에서는 mock provider의 키를 만들 수 없으나, 타입은 허용.
4. **`Panel.history`는 String[]**: 순서 의미가 있음 (history 순). 별도 RenderHistory 테이블 없음.
5. **파생 필드는 DTO에만 존재**: `refImageUrls`, `currentRenderStatus`, `currentRenderImageUrl`, `contiUrl`, `resultImageUrl`, `thumbnailUrl`, `backgroundUrl`은 모두 응답 직전에 채워지는 presigned URL/조인 필드이며 DB에는 없음.
6. **`text` 컬럼 기본값 `{}`** (`schema.prisma:197`): DTO `TipTapDoc`은 `{type:'doc', content:[...]}` 형태이므로 신규 패널 생성 시 `emptyDoc()` (`index.ts:334-336`)으로 정규화 필요.
7. **`Project.defaultStyleId` / `Panel.styleId` / `Project.defaultModel` FK·enum 부재**(`schema.prisma:83, 84, 176`): 셋 다 외부 참조이나 FK/enum 강제 없음. 엔티티 삭제·모델 ID 변경 시 dangling 값이 남을 수 있으며 cleanup·정합성은 애플리케이션 레벨에서 처리. `ir.builder.ts` 의 effectiveStyleId 결정 로직과 함께 본다.
8. **SpeechBubble.text 제거**(2026-05-19 migration): 캔버스 텍스트는 [[page-text]] (`page_texts` 테이블)로 이전. 옛 클라이언트가 SpeechBubble.text 를 PATCH 로 보내도 백엔드 스키마(`SpeechBubblePatchSchema`)가 거부한다.
