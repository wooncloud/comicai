# ComicAI

AI 만화 제작 도구. 캐릭터·배경·세계관·그림체의 일관성을 유지하며 패널 단위로 만화를 생성한다.

상세 문서는 [`docs/`](./docs/) 참조. 30초 요약은 [`PRD.md`](./PRD.md).

## 빠른 시작

요구사항: Node 20+, pnpm 9+, Docker.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/compose/dev.yml up -d
pnpm dev
```

자세한 로컬 개발 가이드: [`docs/40-ops/02-local-dev.md`](./docs/40-ops/02-local-dev.md).

## 구조

```
apps/web      # Next.js
apps/api      # Nest.js (HTTP + SSE)
packages/types
packages/db
packages/adapters
packages/events
infra/compose # docker-compose
```
