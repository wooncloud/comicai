# 배포

> v0.1 — 2026-05-16 — Draft

## 토폴로지

- 호스팅: 개인 PC (macOS).
- 외부 노출: Cloudflare Zero Trust Tunnel (`cloudflared`).
- 컨테이너: Docker Compose.

## docker-compose 구성

실제 정의는 `infra/compose/full.yml`을 참고. 핵심 구성:

- `postgres` / `redis` / `minio` — 인프라.
- `migrate` — Prisma 마이그레이션 1회 실행 후 종료.
- `api` — HTTP 전용 (`RENDER_WORKER_DISABLED=1`).
- `worker` — 렌더 워커 전용 (`node apps/api/dist/worker.js`).
- `web` — Next.js standalone.
- `cloudflared` — `profile=tunnel` 시 활성. `CLOUDFLARE_TUNNEL_TOKEN` 필수.
- `backup` — `profile=backup` 시 활성. pg_dump + mc mirror cron.

공통 환경변수는 `x-db-env`, `x-s3-env`, `x-api-env` YAML 앵커로 정의되어 있어 변경은 한 곳에서.

## 환경 변수

- `MASTER_KEY` — API 키 암호화용 (32바이트 base64).
- `DATABASE_URL`, `REDIS_URL`, `S3_*`.
- `NEXTAUTH_SECRET`, OAuth credentials.
- `CLOUDFLARE_TUNNEL_TOKEN`.

`.env.example` 템플릿 제공. 실제 `.env`는 `.gitignore`.

## 배포 절차

1. `git pull`.
2. `pnpm install`.
3. `pnpm build`.
4. `docker compose build`.
5. `docker compose up -d`.
6. 헬스체크: `curl https://api.example.com/healthz` (200 OK).

## 롤백

- 직전 이미지 태그로 `docker compose up -d --no-deps api worker`.
- DB 마이그레이션 롤백은 별도 매뉴얼 (Prisma).

## 워커 분리

`infra/compose/full.yml`은 기본적으로 api와 worker를 별도 컨테이너로 분리한다.

- `api`: HTTP 서버만 (`RENDER_WORKER_DISABLED=1`).
- `worker`: `node apps/api/dist/worker.js` 진입점, BullMQ 워커만 부팅.
- 두 컨테이너는 동일 이미지를 공유 (Dockerfile은 그대로).
- SSE는 `Redis pub/sub` 기반으로 동작하므로 worker가 publish한 이벤트가 api 인스턴스의 클라이언트로 fan-out됨.

운영 정책상 같은 컨테이너에서 동시 운영하려면 worker 서비스를 끄고 api의 `RENDER_WORKER_DISABLED=0`으로 둘 것.

## Cloudflare Tunnel

`profiles: ["tunnel"]`로 토글:

```sh
docker compose -f infra/compose/full.yml --profile tunnel up -d
```

`CLOUDFLARE_TUNNEL_TOKEN`이 필수. cloudflared 대시보드에서 토큰 발급 후 `.env`에 설정.

## 백업

`profiles: ["backup"]` 컨테이너가 cron으로 매일 03:00 KST에 `pg_dump`(gzip) + MinIO 버킷 `mc mirror`를 `backup_data` 볼륨에 저장.

- `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`로 조정.
- 즉시 테스트: `BACKUP_RUN_ON_START=1`로 부팅 직후 1회 실행.

## 테스트

- 단위: `pnpm -r test` (vitest, mock 기반).
- 통합 (API): `pnpm --filter @comicai/api test:integration` — testcontainers로 Postgres/Redis 부팅, Prisma migrate deploy 후 supertest로 검증. Docker 데몬 필요.
- E2E (Web): `pnpm --filter @comicai/web e2e:install && pnpm --filter @comicai/web e2e` — Playwright. 사전에 API + 인프라가 떠 있어야 함.

## 변경 이력

- 2026-05-16: 초기 작성 + worker 분리 / backup / E2E 추가
