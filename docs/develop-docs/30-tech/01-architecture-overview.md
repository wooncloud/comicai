# 시스템 아키텍처 개요

> v0.1 — 2026-05-16 — Draft

## 컴포넌트 다이어그램

```
[Browser]
  ├── Next.js (SSR + Client)
  │     - tldraw 캔버스
  │     - TipTap 텍스트 + 멘션
  │     - shadcn UI / Tailwind
  │
  ▼ HTTPS (Cloudflare Tunnel)
[cloudflared]
  ▼
[Nest.js API]
  - REST/JSON
  - SSE (렌더 진행 스트림)
  - 인증 가드
  ├──> [PostgreSQL]
  ├──> [Redis] ── [BullMQ Worker(s)] ──> Gemini / OpenAI API
  └──> [MinIO] (S3 호환 이미지 스토리지)
```

## 컨테이너 구성 (docker-compose)

| 컨테이너      | 역할                           | 포트(내부) |
| ------------- | ------------------------------ | ---------- |
| `web`         | Next.js                        | 3000       |
| `api`         | Nest.js (HTTP + SSE)           | 4000       |
| `worker`      | Nest.js 워커 (BullMQ consumer) | -          |
| `postgres`    | DB                             | 5432       |
| `redis`       | 큐/캐시                        | 6379       |
| `minio`       | 이미지 스토리지                | 9000       |
| `cloudflared` | Zero Trust Tunnel              | -          |

## 모노레포 구성 (pnpm workspace)

```
comicai/
├── apps/
│   ├── web/              # Next.js
│   └── api/              # Nest.js (HTTP)
├── packages/
│   ├── types/            # 공통 TypeScript 타입 (계약)
│   ├── db/               # Prisma 스키마 + 마이그레이션
│   ├── adapters/         # ModelAdapter 구현 (Gemini, OpenAI, Mock)
│   ├── events/           # SSE 이벤트 스키마
│   └── ui/               # 공통 React 컴포넌트 (선택)
├── infra/
│   ├── docker/
│   └── compose/
└── tests/                # 통합 + E2E
```

## 시퀀스: 렌더 요청

```
[Client]                [API]              [Redis/BullMQ]      [Worker]         [Model API]
  ─ POST /render ─────▶
                       enqueue ─────────▶
                       ◀── jobId ────
  ◀── 202 + jobId ──
  ─ SSE /events ─────▶
                                                              dequeue ◀────
                                                              build req
                                                              ─ call ────────▶
                                                                              (image)
                                                              ◀── result ────
                                                              save MinIO
                                                              update DB
  ◀── SSE: SUCCEEDED ─────────────────────────────────────────
```

## 핵심 설계 결정 요약

- 패널 단위 렌더 → [ADR-0006](../90-decisions/0006-panel-level-rendering.md)
- BullMQ + Redis → [ADR-0004](../90-decisions/0004-bullmq-redis.md)
- MinIO 사용 → [ADR-0005](../90-decisions/0005-minio-not-volume.md)
- Cloudflare Tunnel → [ADR-0007](../90-decisions/0007-cloudflare-tunnel-personal-pc.md)
- BYOK → [ADR-0001](../90-decisions/0001-byok-for-mvp.md)

## 변경 이력

- 2026-05-16: 초기 작성
