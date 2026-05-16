# 데이터 모델

> v0.1 — 2026-05-16 — Draft

## ER 다이어그램 (ASCII)

```
┌──────┐ 1     N ┌──────────┐ 1     N ┌──────────────────┐
│ User │─────────│ Project  │─────────│ ConsistencyEntity │
└──────┘         └──────────┘         └──────────────────┘
   │ 1            │ 1
   │              │
   │ N            │ N
┌──────────┐    ┌──────┐ 1     N ┌───────┐ 1     N ┌───────────┐
│ ApiKey   │    │ Page │─────────│ Panel │─────────│ RenderJob │
└──────────┘    └──────┘         └───────┘         └───────────┘
                                                          │ 0..1
                                                          ▼
                                                    ┌─────────────┐
                                                    │ ImageAsset  │
                                                    └─────────────┘
```

## 엔티티

### User

```ts
{
  id: string;            // user_...
  email: string;
  passwordHash?: string; // OAuth-only면 null
  oauthProviders: { provider: 'google'|'github'; subject: string }[];
  createdAt: Date;
}
```

### ApiKey

```ts
{
  id: string;
  userId: string;
  provider: 'gemini' | 'openai';
  ciphertext: string;    // AES-256-GCM 암호화된 raw key
  nonce: string;
  lastVerifiedAt?: Date;
  isActive: boolean;
  createdAt: Date;
}
```

### Project

```ts
{
  id: string;            // proj_...
  userId: string;
  name: string;
  thumbnail?: string;    // 첫 페이지 썸네일 키
  createdAt: Date;
  updatedAt: Date;
}
```

### ConsistencyEntity

```ts
{
  id: string;            // char_... / bg_... / style_... / world_...
  projectId: string;
  type: 'style' | 'character' | 'background' | 'worldview';
  name: string;
  aliases: string[];
  description: string;
  refImages: ImageRef[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type ImageRef = {
  storageKey: string;
  width: number;
  height: number;
  mimeType: string;
};
```

### Page

```ts
{
  id: string;            // page_...
  projectId: string;
  order: number;
  size: { w: number; h: number };
  background?: ImageRef;
  createdAt: Date;
}
```

### Panel

```ts
{
  id: string;            // panel_...
  pageId: string;
  shape: PanelShape;     // 도형 좌표, 테두리 스타일
  conti?: ImageRef;
  text: TipTapDoc;       // 멘션 노드 포함 (JSONB)
  refImages: ImageRef[];
  currentRenderId?: string;
  history: string[];     // RenderJob id 큐, 최대 20
}

type PanelShape = {
  type: 'rect' | 'polygon';
  points: { x: number; y: number }[];
  strokeColor: string | 'transparent';
  strokeWidth: number;
};
```

### RenderJob

```ts
{
  id: string;            // render_...
  panelId: string;
  userId: string;
  model: 'gemini-3.1-flash-image-preview' | 'gpt-image-2';
  ir: RenderIR;          // JSONB 스냅샷
  status: 'queued'|'running'|'succeeded'|'failed'|'timeout'|'canceled';
  resultImage?: ImageRef;
  error?: {
    category: 'transient'|'auth'|'quota'|'safety'|'invalid'|'timeout';
    message: string;
    rawResponse?: unknown;
  };
  attempts: number;
  createdAt: Date;
  finishedAt?: Date;
}
```

자세한 `RenderIR`은 → [`04-render-pipeline.md`](./04-render-pipeline.md)

## Postgres 스키마 (Prisma 권장)

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  ciphertext        TEXT NOT NULL,
  nonce             TEXT NOT NULL,
  last_verified_at  TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  thumbnail   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consistency_entities (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  name         TEXT NOT NULL,
  aliases      TEXT[] NOT NULL DEFAULT '{}',
  description  TEXT NOT NULL DEFAULT '',
  ref_images   JSONB NOT NULL DEFAULT '[]',
  version      INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "order"     INT NOT NULL,
  size        JSONB NOT NULL,
  background  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE panels (
  id                 TEXT PRIMARY KEY,
  page_id            TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  shape              JSONB NOT NULL,
  conti              JSONB,
  text               JSONB NOT NULL DEFAULT '{}',
  ref_images         JSONB NOT NULL DEFAULT '[]',
  current_render_id  TEXT,
  history            TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE render_jobs (
  id           TEXT PRIMARY KEY,
  panel_id     TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model        TEXT NOT NULL,
  ir           JSONB NOT NULL,
  status       TEXT NOT NULL,
  result_image JSONB,
  error        JSONB,
  attempts     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX idx_render_jobs_panel ON render_jobs(panel_id, created_at DESC);
CREATE INDEX idx_consistency_project ON consistency_entities(project_id, type);
```

## ULID + Prefix 생성 규칙

- 라이브러리: `ulid` 또는 `ulidx`.
- ID = `{prefix}_{ULID}`.
- 새 prefix 추가 시 [`../00-overview/02-glossary.md`](../00-overview/02-glossary.md)에 등록.

## 변경 이력

- 2026-05-16: 초기 작성
