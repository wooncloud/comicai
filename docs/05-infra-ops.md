# 05. 인프라 & 운영

ComicAI의 인프라/운영 자산은 세 위치에 모여 있다.

- `infra/compose/` — docker-compose 정의 (`dev.yml`, `full.yml`)
- `infra/docker/` — 애플리케이션 이미지 Dockerfile (`api.Dockerfile`, `web.Dockerfile`)
- `infra/backup/` — Postgres + MinIO 백업 사이드카 이미지
- `scripts/` — 부트스트랩 유틸리티

---

## 1. Docker Compose

### 1.1 `infra/compose/dev.yml` — 인프라만

로컬에서 `pnpm dev`로 앱을 돌릴 때 사용. Postgres / Redis / MinIO만 띄운다.

| 서비스     | 이미지                       | 호스트 포트              | 컨테이너 포트 | 볼륨                    |
| ---------- | ---------------------------- | ------------------------ | ------------- | ----------------------- |
| `postgres` | `postgres:16` (`dev.yml:5`)  | `5433` (`:13`)           | 5432          | `postgres_data` (`:15`) |
| `redis`    | `redis:7-alpine` (`:23`)     | `6379` (`:27`)           | 6379          | `redis_data` (`:29`)    |
| `minio`    | `minio/minio:latest` (`:37`) | `9000`/`9001` (`:45-46`) | 9000/9001     | `minio_data` (`:48`)    |

모두 `restart: unless-stopped` + healthcheck 포함.

- Postgres healthcheck: `pg_isready -U $POSTGRES_USER` (`dev.yml:17`)
- Redis healthcheck: `redis-cli ping` (`dev.yml:31`)
- MinIO healthcheck: `GET /minio/health/live` (`dev.yml:50`)

> 주의: Postgres는 **호스트 5433** 으로 노출된다 — `DATABASE_URL`에 `localhost:5433` 사용.

### 1.2 `infra/compose/full.yml` — 전체 스택

`api`, `worker`, `web`, `migrate`, 옵션 `cloudflared` / `backup` 까지 모두 컨테이너로 실행.

#### YAML 앵커로 공통 env 정의

- `x-db-env` (`full.yml:9`) — `DATABASE_URL` (in-cluster hostname `postgres:5432`)
- `x-s3-env` (`full.yml:12`) — `S3_ENDPOINT=http://minio:9000`, `S3_PUBLIC_ENDPOINT` (브라우저용)
- `x-api-env` (`full.yml:22`) — DB+S3 + `REDIS_URL=redis://redis:6379`, `MASTER_KEY` (필수)

#### 서비스 일람

| 서비스                     | 이미지/빌드                                                                     | 호스트 포트     | depends_on                         |
| -------------------------- | ------------------------------------------------------------------------------- | --------------- | ---------------------------------- |
| `postgres` (`full.yml:29`) | `postgres:16`                                                                   | `5433`          | —                                  |
| `redis` (`:47`)            | `redis:7-alpine`                                                                | `6379`          | —                                  |
| `minio` (`:61`)            | `minio/minio:latest`                                                            | `9000`,`9001`   | —                                  |
| `migrate` (`:80`)          | `infra/docker/api.Dockerfile`                                                   | —               | postgres(healthy)                  |
| `api` (`:94`)              | `infra/docker/api.Dockerfile`                                                   | `4000` (`:122`) | postgres, redis, minio, migrate    |
| `worker` (`:129`)          | `infra/docker/api.Dockerfile` (`command: node apps/api/dist/worker.js`, `:148`) | —               | 동일 + migrate                     |
| `web` (`:150`)             | `infra/docker/web.Dockerfile`                                                   | `3000` (`:166`) | api(healthy)                       |
| `cloudflared` (`:169`)     | `cloudflare/cloudflared:latest`                                                 | —               | web, api (profile `tunnel`)        |
| `backup` (`:183`)          | `../backup`                                                                     | —               | postgres, minio (profile `backup`) |

`migrate`는 `prisma migrate deploy` 실행 후 종료(`restart: "no"`, `:92`), `api`/`worker`는 `service_completed_successfully` 조건으로 대기(`:107`, `:142`).

`api` 컨테이너는 `RENDER_WORKER_DISABLED=1`로 BullMQ consumer를 끄고(`full.yml:114`), `worker` 컨테이너에서만 렌더링 큐를 처리(`RENDER_WORKER_DISABLED=0`, `:146`). `RENDER_CONCURRENCY` 기본 2 (`:147`).

#### Profiles

- `tunnel` — Cloudflare Tunnel 활성화 (아래 §6 참조)
- `backup` — 백업 사이드카 활성화

#### 명령어

```sh
# 인프라만 (앱은 pnpm dev)
docker compose -f infra/compose/dev.yml up -d

# 전체 스택
docker compose -f infra/compose/full.yml up -d --build

# 터널 포함
docker compose -f infra/compose/full.yml --profile tunnel up -d --build

# 백업 사이드카 포함
docker compose -f infra/compose/full.yml --profile backup up -d --build
```

---

## 2. Dockerfile

### 2.1 `infra/docker/api.Dockerfile` (api + worker 공용)

3-stage 빌드 (`api.Dockerfile:1-58`).

1. **`deps`** (`:8`) — `node:20-alpine` 베이스. `python3 make g++ libc6-compat openssl` 설치(네이티브 모듈/Prisma 용). `pnpm@9.12.0`을 corepack으로 활성화 후 워크스페이스 `package.json`만 복사하여 `pnpm install --frozen-lockfile` (`:22`) — 의존성 캐시 레이어 최적화.
2. **`builder`** (`:25`) — `packages/`, `apps/api/` 소스 복사. 순서대로:
   - `prisma generate` (`:31`)
   - 워크스페이스 패키지 빌드 `@comicai/types`, `events`, `db`, `adapters` (`:32`)
   - `nest build` (`:33`)
3. **`runner`** (`:36`) — `openssl libc6-compat dumb-init` + 비루트 사용자 `comicai:1001` (`:42`). 루트 `node_modules`(.pnpm 스토어)와 워크스페이스별 `node_modules` 심볼릭 링크를 모두 복사(`:46-51`). 기본 CMD는 `node apps/api/dist/main.js`; worker는 compose에서 `command` override.

EXPOSE `4000`.

### 2.2 `infra/docker/web.Dockerfile` (Next.js standalone)

3-stage (`web.Dockerfile:1-57`).

1. **`deps`** — 동일하게 워크스페이스 락 설치 (`:6-20`).
2. **`builder`** — `packages/`, `apps/web/` 복사. `ARG NEXT_PUBLIC_API_URL` (`:29`, 기본 `http://localhost:4000`)을 build-time env로 주입해 Next 빌드 시 인라인. `@comicai/types` 빌드 → `next build` (`:33-34`).
3. **`runner`** — Next standalone 산출물(`apps/web/.next/standalone`)만 복사 (`:46`). `dumb-init` + `nextjs:1001` 사용자 (`:42`). `PORT=3000`, `HOSTNAME=0.0.0.0` (`:52-53`). 실행: `node apps/web/server.js`.

EXPOSE `3000`.

---

## 3. 백업 — `infra/backup/`

### 3.1 이미지 (`infra/backup/Dockerfile`)

`alpine:3.20` 기반(`Dockerfile:2`). 다음을 설치:

- `postgresql16-client` (pg_dump)
- `gzip findutils tzdata busybox-suid` (cron용)
- `mc` (MinIO client, `:5`)

`TZ=Asia/Seoul`, 기본 스케줄 `BACKUP_SCHEDULE="0 3 * * *"` (`:14`). entrypoint는 `entrypoint.sh`.

### 3.2 `backup.sh`

1. `pg_dump`로 `${BACKUP_DIR}/postgres/${DB}-${ts}.sql.gz` 생성 (`backup.sh:25-29`)
2. `mc alias set` 후 `mc mirror --overwrite --remove src/${S3_BUCKET} ${BACKUP_DIR}/minio/${BUCKET}` — MinIO 버킷을 로컬 디렉터리에 미러링 (`:32-33`)
3. `BACKUP_RETENTION_DAYS`(기본 14)보다 오래된 dump 삭제 (`:36`)

### 3.3 `entrypoint.sh` — cron 부트스트랩

- `env | awk` 로 `POSTGRES_/S3_/MINIO_/BACKUP_` 환경변수만 추출, shell-safe escape 후 `/app/env`에 export 라인 작성(`entrypoint.sh:6-13`).
- crontab에 `${BACKUP_SCHEDULE} . /app/env; /app/backup.sh >> /proc/1/fd/1 2>&1` 등록 (`:15-17`).
- `RUN_ON_START=1`이면 컨테이너 기동 즉시 1회 실행 (`:22-25`).
- `crond -f -l 8` foreground 실행 (`:27`).

볼륨은 `backup_data:/backup` (`full.yml:205`).

---

## 4. `scripts/` — 유틸리티

현재 디렉터리에는 단일 스크립트가 있다.

### `scripts/cmux-bootstrap.sh`

ComicAI 개발용 cmux 워크스페이스 `comicai-dev` 를 생성한다 (`cmux-bootstrap.sh:15-79`). 표준 레이아웃은 `docs/40-ops/04-cmux-workflow.md` 참조.

생성되는 탭:

1. **`infra`** (`:35`) — `docker compose -f infra/compose/dev.yml logs -f postgres redis minio cloudflared` + `docker stats`
2. **`backend`** (`:41`) — `pnpm --filter api dev`, `pnpm --filter worker dev`, `pnpm --filter db studio`
3. **`frontend`** (`:49`) — `pnpm --filter web dev`, cmux 브라우저 `http://localhost:3000`
4. **`agents`** (`:56`) — Claude Code 인스턴스 4분할 (Backend / Editor / Adapter / Orchestrator)
5. **`qa`** (`:66`) — `pnpm test --watch`, `pnpm e2e --watch --ui`, A-QA, `tail -F logs/api/error.log`

기존 워크스페이스가 있으면 abort (`:25-29`).

---

## 5. 환경변수

루트 `.env.example` (`.env.example`) 가 단일 source of truth.

### 카테고리별 변수

| 카테고리       | 변수                                                          | 기본/예시                                                           | 비고                                                                                             |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **DB**         | `POSTGRES_USER` / `_PASSWORD` / `_DB`                         | `comicai`                                                           | compose 환경에 그대로 전달                                                                       |
|                | `DATABASE_URL`                                                | `postgresql://comicai:comicai@localhost:5433/comicai?schema=public` | 로컬 호스트는 `:5433`, 컨테이너 내부는 `postgres:5432` (full.yml의 `x-db-env`가 자동 오버라이드) |
| **Redis**      | `REDIS_URL`                                                   | `redis://localhost:6379`                                            | 컨테이너 내부는 `redis://redis:6379`                                                             |
| **S3 (MinIO)** | `S3_ENDPOINT`                                                 | `http://localhost:9000`                                             | 컨테이너 내부는 `http://minio:9000`                                                              |
|                | `S3_PUBLIC_ENDPOINT`                                          | `http://localhost:9000`                                             | **브라우저용** presigned URL 서명 host (`.env.example:13`)                                       |
|                | `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `us-east-1` / `comicai` / `minioadmin` / `minioadmin`               |                                                                                                  |
|                | `MINIO_ROOT_USER` / `_PASSWORD`                               | `minioadmin`                                                        |                                                                                                  |
| **보안**       | `MASTER_KEY`                                                  | (필수, 32-byte base64)                                              | AES-256-GCM KEK. `full.yml:26`에서 `:?` 로 강제                                                  |
|                | `SESSION_SECRET`                                              | (필수)                                                              | 세션 쿠키 서명                                                                                   |
| **앱**         | `API_PORT`                                                    | `4000`                                                              |                                                                                                  |
|                | `WEB_PORT`                                                    | `3000`                                                              | `apps/web` `next dev -p ${WEB_PORT:-3000}`                                                       |
|                | `NEXT_PUBLIC_API_URL`                                         | `http://localhost:4000`                                             | Next 빌드 시 인라인 (`web.Dockerfile:29`)                                                        |
|                | `INTERNAL_API_URL`                                            | `http://api:4000`                                                   | full.yml 내부 server→server (`full.yml:163`)                                                     |
|                | `API_PUBLIC_URL`                                              | `http://localhost:4000`                                             | OAuth callback URL용                                                                             |
| **렌더 워커**  | `RENDER_WORKER_DISABLED`                                      | `0`                                                                 | api 컨테이너=1, worker 컨테이너=0                                                                |
|                | `RENDER_CONCURRENCY`                                          | `2`                                                                 | BullMQ 워커 동시성                                                                               |
| **OAuth**      | `GOOGLE_OAUTH_CLIENT_ID/SECRET`                               | —                                                                   |                                                                                                  |
|                | `GITHUB_OAUTH_CLIENT_ID/SECRET`                               | —                                                                   |                                                                                                  |
| **Cloudflare** | `CLOUDFLARE_TUNNEL_TOKEN`                                     | —                                                                   | `--profile tunnel`일 때 필수                                                                     |
| **백업**       | `BACKUP_SCHEDULE`                                             | `0 3 * * *`                                                         | cron expr                                                                                        |
|                | `BACKUP_RETENTION_DAYS`                                       | `14`                                                                |                                                                                                  |
|                | `BACKUP_RUN_ON_START`                                         | `0`                                                                 | 컨테이너 기동 직후 1회 실행                                                                      |
|                | `COOKIE_SECURE`                                               | `0`                                                                 | full.yml api 환경, 프로덕션은 `1` (`full.yml:115`)                                               |
|                | `WEB_ORIGIN`                                                  | `http://localhost:3000`                                             | CORS allow-list (`full.yml:112`)                                                                 |

> `apps/api`, `apps/web`에 별도 `.env.*`는 존재하지 않으며 루트 `.env` 만 사용.

---

## 6. 로컬 개발 워크플로우

### 6.1 표준 흐름 (인프라 docker, 앱 pnpm)

```sh
# 1) 인프라
docker compose -f infra/compose/dev.yml up -d

# 2) 의존성 + DB 마이그레이션
pnpm install
pnpm --filter @comicai/db exec prisma migrate deploy

# 3) 전체 dev 오케스트레이션
pnpm dev
```

### 6.2 Turbo 오케스트레이션 — `turbo.json`

- `globalDependencies: [".env"]` (`turbo.json:3`) — `.env` 변경 시 캐시 무효화
- `build`: `dependsOn: ["^build"]`, outputs `dist/**`, `.next/**` (`:5-8`)
- `@comicai/api#dev` (`:9`): types/db/events/adapters 빌드 후 시작. `cache: false, persistent: true`
- `dev` (`:14`): 그 외 워크스페이스의 dev — cache 끄고 persistent
- `typecheck`, `test`: `^build` 의존

루트 `package.json` (`package.json:9-15`): `pnpm dev` → `turbo run dev` 가 모든 워크스페이스의 `dev` 태스크를 병렬 실행.

### 6.3 포트 맵

| 포트   | 서비스                 | 출처                                                          |
| ------ | ---------------------- | ------------------------------------------------------------- |
| `3000` | Next.js web            | `apps/web/package.json` `next dev -p ${WEB_PORT:-3000}`       |
| `4000` | NestJS api             | `apps/api/package.json` `nest start --watch`, `API_PORT=4000` |
| `5433` | Postgres (호스트 노출) | `dev.yml:13`                                                  |
| `6379` | Redis                  | `dev.yml:27`                                                  |
| `9000` | MinIO S3 API           | `dev.yml:45`                                                  |
| `9001` | MinIO Console          | `dev.yml:46`                                                  |

---

## 7. Cloudflare Tunnel

`infra/compose/full.yml:169-180` 에 `cloudflared` 서비스가 `profile: ["tunnel"]` 로 정의돼 있다.

- 이미지: `cloudflare/cloudflared:latest`
- 커맨드: `tunnel --no-autoupdate run`
- 인증: `TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}` — Cloudflare Zero Trust 대시보드에서 발급한 토큰을 `.env`에 채워야 한다. 빈 값이면 즉시 종료 (`full.yml:177` 주석).
- 의존: `web`, `api` (단순 `depends_on`, healthcheck 조건 없음)

활성화:

```sh
docker compose -f infra/compose/full.yml --profile tunnel up -d --build
```

외부 도메인으로 노출할 때는 추가로 다음을 조정한다.

- `S3_PUBLIC_ENDPOINT` — presigned URL의 서명 host (`.env.example:14`)
- `WEB_ORIGIN` — CORS allow-list
- `API_PUBLIC_URL` — OAuth callback 정확한 외부 URL
- `COOKIE_SECURE=1`
- `NEXT_PUBLIC_API_URL` — 외부 API URL (web 이미지 재빌드 필요)

---

## 8. 파일 인덱스

- `infra/compose/dev.yml` — 인프라만
- `infra/compose/full.yml` — 전체 스택 + 옵션 profile (tunnel/backup)
- `infra/docker/api.Dockerfile` — NestJS api + worker
- `infra/docker/web.Dockerfile` — Next.js standalone
- `infra/backup/Dockerfile` · `backup.sh` · `entrypoint.sh` — 백업 사이드카
- `scripts/cmux-bootstrap.sh` — cmux 개발 워크스페이스
- `turbo.json` · `package.json` — pnpm/turbo 오케스트레이션
- `.env.example` — 환경변수 템플릿
