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

전체 목록과 기본값은 `docs/05-infra-ops.md` §5 에 있다. 배포에서 빠뜨리면 바로 문제가
되는 것만:

- `MASTER_KEY` — API 키 암호화용 KEK (32바이트 base64). compose 가 `:?` 로 강제한다.
- `REDIS_PASSWORD` — 마찬가지로 `:?` 로 강제. 세션과 렌더 큐가 redis 에 있다.
- `DATABASE_URL`, `S3_*`, OAuth credentials.
- `WEB_ORIGIN` — CORS 허용 오리진 + OAuth 콜백 + 메일 링크를 한 값이 정한다.
  실제 도메인에서 빠뜨리면 브라우저가 모든 API 호출을 막는데 서버 로그는 깨끗하다.
- `CLOUDFLARE_TUNNEL_TOKEN` — `profile=tunnel` 일 때만.

`.env.example` 템플릿 제공. 실제 `.env`는 `.gitignore`.

> `NEXTAUTH_SECRET` 은 이 프로젝트에 없다(next-auth 를 쓰지 않는다). 예전 문서에 남아
> 있던 이름이다. 세션은 자체 구현이고, 서명 대신 난수 식별자를 Redis 에 저장한다.
> `.env.example` 의 `SESSION_SECRET` 도 **현재 코드가 읽지 않는다** — `docs/05-infra-ops.md`
> §5 각주 참고.

## 배포 절차

**손으로 하지 않는다.** `main` 에 push 하면 CI 통과 후 자동으로 배포된다
(`.github/workflows/deploy.yml`). 프로덕션 호스트 자체가 self-hosted 러너다.

러너가 하는 일은 두 줄이다:

```sh
git fetch --prune origin && git reset --hard origin/main
compose="docker compose -f infra/compose/full.yml --env-file .env --profile tunnel --profile backup"
$compose up -d --build --force-recreate web api worker
$compose up -d --build backup cloudflared
```

- 호스트에 남은 커밋 안 된 변경은 `git reset --hard` 로 유실된다. `.env` 는 git 추적
  대상이 아니라 보존된다.
- 이미지를 미리 빌드하거나 레지스트리에 올리지 않는다. 러너가 소스에서 바로 빌드한다.
- `api`/`worker` 가 `migrate` 를 `service_completed_successfully` 로 의존하므로
  `prisma migrate deploy` 가 함께 돈다. **마이그레이션이 든 커밋을 push 하면 프로덕션
  스키마도 같이 바뀐다.**
- `backup`·`cloudflared` 는 두 번째 줄에서 따로 올린다. profile 을 켜는 것과 컨테이너를
  올리는 것은 다르다 — 예전에는 서비스 이름이 없어 백업 컨테이너가 한 번도 안 떴다.

손으로 돌려야 할 때는 `pnpm run deploy` (`scripts/deploy.sh`) 가 같은 일을 한다.
`pnpm deploy` 는 pnpm 내장 명령이라 가로채이므로 `run` 을 반드시 붙인다.

자세한 것은 `docs/05-infra-ops.md` §8.

## 롤백

**이미지 태그가 없다.** 컨테이너는 매번 소스에서 빌드되므로 "직전 이미지로 되돌리기"
같은 경로는 존재하지 않는다. 되돌리는 방법은 코드를 되돌리는 것뿐이다.

- `main` 에 revert 커밋을 push → CI 통과 후 같은 파이프라인이 이전 상태를 다시 빌드한다.
- 급하면 프로덕션 호스트에서 직접: 원하는 커밋으로 체크아웃한 뒤 `pnpm run deploy --no-pull`
  (코드는 그대로 두고 컨테이너만 재기동). 다음 자동 배포가 `origin/main` 으로 덮어쓴다는
  점에 주의.
- DB 마이그레이션 롤백은 자동화돼 있지 않다. Prisma 는 down 마이그레이션을 만들지
  않으므로 스키마를 되돌리려면 손으로 SQL 을 써야 한다 — 즉 **스키마를 바꾸는 배포는
  롤백이 대칭이 아니다.**

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

`profiles: ['backup']` 컨테이너가 cron으로 매일 03:00 KST에 `pg_dump`(gzip) + MinIO 버킷 `mc mirror`를 저장한다. 기본 저장 위치는 `backup_data` 도커 볼륨이라 **원본과 같은 디스크**에 앉는다 — `BACKUP_HOST_PATH` 로 다른 디스크/NAS 를 지정할 수 있고, `BACKUP_REMOTE_*` 를 채우면 매 회차 외부 S3 로 사본을 민다.

- `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`로 조정.
- 즉시 테스트: `BACKUP_RUN_ON_START=1`로 부팅 직후 1회 실행.
- 마지막 성공이 `BACKUP_STALE_HOURS`(기본 26) 보다 낡으면 컨테이너가 unhealthy 가 된다.
  실패 알림은 `BACKUP_WEBHOOK_URL` 이 있을 때만 나가고, 없으면 로그와 healthcheck 만 남는다.
- 자세한 것은 `docs/05-infra-ops.md` §3.

## 테스트

- 단위: `pnpm test` (turbo, vitest, mock 기반).
- 통합 (API): `pnpm --filter @comicai/api test:integration` — testcontainers로 Postgres/Redis 부팅, Prisma migrate deploy 후 supertest로 검증. Docker 데몬 필요.
- E2E (Web): `pnpm --filter @comicai/web e2e:install && pnpm --filter @comicai/web e2e` — Playwright. 사전에 API + 인프라가 떠 있어야 함.

## 변경 이력

- 2026-05-16: 초기 작성 + worker 분리 / backup / E2E 추가
- 2026-09-05: 배포 절차를 실제(`deploy.yml` 자동 배포)에 맞춤. 없는 `NEXTAUTH_SECRET`
  삭제, 이미지 태그 롤백 서술 정정, 백업 저장 위치·healthcheck 보강
