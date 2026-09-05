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
| `postgres` | `postgres:16` (`dev.yml:5`)  | `5433` (`:15`)           | 5432          | `postgres_data` (`:17`) |
| `redis`    | `redis:7-alpine` (`:25`)     | `6379` (`:29`)           | 6379          | `redis_data` (`:31`)    |
| `minio`    | `minio/minio:latest` (`:39`) | `9000`/`9001` (`:47-48`) | 9000/9001     | `minio_data` (`:50`)    |

모두 `restart: unless-stopped` + healthcheck 포함.

- Postgres healthcheck: `pg_isready -U $POSTGRES_USER` (`dev.yml:19`)
- Redis healthcheck: `redis-cli ping` (`dev.yml:33`)
- MinIO healthcheck: `GET /minio/health/live` (`dev.yml:50`)

> 주의: Postgres는 **호스트 5433** 으로 노출된다 — `DATABASE_URL`에 `localhost:5433` 사용.

### 1.2 `infra/compose/full.yml` — 전체 스택

`api`, `worker`, `web`, `migrate`, 옵션 `cloudflared` / `backup` 까지 모두 컨테이너로 실행.

#### YAML 앵커로 공통 env 정의

- `x-db-env` (`full.yml:9`) — `DATABASE_URL` (in-cluster hostname `postgres:5432`)
- `x-s3-env` (`full.yml:12`) — `S3_ENDPOINT=http://minio:9000`, `S3_PUBLIC_ENDPOINT` (브라우저용)
- `x-api-env` (`full.yml:22`) — DB+S3 + `REDIS_URL` (`:25`, `REDIS_PASSWORD` 를 `:?` 로 강제해
  `redis://:<pw>@redis:6379` 로 조립), `MASTER_KEY` (`:26`, 필수),
  `ADMIN_EMAILS`·`FEATURE_API_KEYS` (`:28-29`), `METRICS_TOKEN` (`:31`)

#### 서비스 일람

| 서비스                     | 이미지/빌드                                                                     | 호스트 포트                    | depends_on                         |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------- |
| `postgres` (`full.yml:41`) | `postgres:16`                                                                   | `5433` (`:52`)                 | —                                  |
| `redis` (`:61`)            | `redis:7-alpine`                                                                | `6379` (`:74`)                 | —                                  |
| `minio` (`:83`)            | `minio/minio:latest`                                                            | `9000` (`:92`), `9001` (`:94`) | —                                  |
| `migrate` (`:103`)         | `infra/docker/api.Dockerfile`                                                   | —                              | postgres(healthy)                  |
| `api` (`:117`)             | `infra/docker/api.Dockerfile`                                                   | `4000` (`:155`)                | postgres, redis, minio, migrate    |
| `worker` (`:162`)          | `infra/docker/api.Dockerfile` (`command: node apps/api/dist/worker.js`, `:185`) | —                              | 동일 + migrate                     |
| `web` (`:187`)             | `infra/docker/web.Dockerfile`                                                   | `3000` (`:209`)                | api(healthy)                       |
| `cloudflared` (`:213`)     | `cloudflare/cloudflared:latest`                                                 | —                              | web, api (profile `tunnel`)        |
| `backup` (`:226`)          | `../backup`                                                                     | —                              | postgres, minio (profile `backup`) |

> 호스트 포트는 전부 `127.0.0.1` 바인딩이다. 이유는 §6.5.

`migrate`는 `prisma migrate deploy` 실행 후 종료(`command`, `:114` / `restart: 'no'`, `:115`), `api`/`worker`는 `service_completed_successfully` 조건으로 대기(`:130-131`, `:180-181`).

`api` 컨테이너는 `RENDER_WORKER_DISABLED=1`로 BullMQ consumer를 끄고(`full.yml:136`), `worker` 컨테이너에서만 렌더링 큐를 처리(`RENDER_WORKER_DISABLED`, `:183`). `RENDER_CONCURRENCY` 기본 2 (`:184`).

`worker` 는 `stop_grace_period: 90s` 를 쓴다 (`full.yml:171`). SIGTERM 을 받으면 `worker.close()` 가
처리 중인 잡을 기다리는데(`apps/api/src/worker.ts:14`), 도커 기본 유예 10초는 렌더 데드라인 60초보다
짧아 배포마다 SIGKILL 로 끊긴다. 그러면 잡이 stalled 로 재큐되어 모델을 한 번 더 호출·과금한다.

#### Profiles

- `tunnel` — Cloudflare Tunnel 활성화 (아래 §7 참조)
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

3-stage 빌드 (`api.Dockerfile:1-60`).

1. **`deps`** (`:8`) — `node:20-alpine` 베이스. `python3 make g++ libc6-compat openssl` 설치(네이티브 모듈/Prisma 용). `pnpm@9.12.0`을 corepack으로 활성화 후 워크스페이스 `package.json`만 복사하여 `pnpm install --frozen-lockfile` (`:22`) — 의존성 캐시 레이어 최적화.
2. **`builder`** (`:25`) — `packages/`, `apps/api/` 소스 복사. 순서대로:
   - `prisma generate` (`:31`)
   - 워크스페이스 패키지 빌드 `@comicai/types`, `events`, `db`, `adapters` (`:32`)
   - `nest build` (`:33`)
3. **`runner`** (`:36`) — `openssl libc6-compat dumb-init font-noto-cjk fontconfig` 설치(`:39`) + 비루트 사용자 `comicai:1001` (`:44`). **font-noto-cjk** 는 sharp 가 export SVG 의 CJK 글리프(특히 한국어 PageText) 를 렌더링하는 데 필요 — 미설치 시 페이지 자유 텍스트의 한글이 PNG 결과에서 사라진다. 루트 `node_modules`(.pnpm 스토어)와 워크스페이스별 `node_modules` 심볼릭 링크를 모두 복사(`:48-53`). 기본 CMD는 `node apps/api/dist/main.js`; worker는 compose에서 `command` override.

EXPOSE `4000`.

### 2.2 `infra/docker/web.Dockerfile` (Next.js standalone)

3-stage (`web.Dockerfile:1-57`).

1. **`deps`** — 동일하게 워크스페이스 락 설치 (`:6-20`).
2. **`builder`** — `packages/`, `apps/web/` 복사. `ARG NEXT_PUBLIC_API_URL` (`:29`, 기본 `http://localhost:4000`)을 build-time env로 주입해 Next 빌드 시 인라인. `NEXT_PUBLIC_FEATURE_API_KEYS` 도 같은 방식으로 받는다 (`:33-34`). 그 뒤 `@comicai/types` 빌드 → `next build` (`:37-38`).
3. **`runner`** — Next standalone 산출물(`apps/web/.next/standalone`)만 복사 (`:46`). `dumb-init` + `nextjs:1001` 사용자 (`:42`). `PORT=3000`, `HOSTNAME=0.0.0.0` (`:52-53`). 실행: `node apps/web/server.js`.

EXPOSE `3000`.

---

## 3. 백업 — `infra/backup/`

### 3.1 이미지 (`infra/backup/Dockerfile`)

`alpine:3.20` 기반(`Dockerfile:2`). 다음을 설치:

- `postgresql16-client` (pg_dump)
- `gzip findutils tzdata busybox-suid` (cron용)
- `curl` — 실패 웹훅 전송용 (`Dockerfile:5`)
- `mc` (MinIO client, `:6`)

`TZ=Asia/Seoul`, 기본 스케줄 `BACKUP_SCHEDULE="0 3 * * *"` (`:16`). entrypoint는 `entrypoint.sh`.

`HEALTHCHECK` 가 `/healthcheck.sh` 를 15분마다 돌린다(`Dockerfile:24-25`). `--start-period=26h`
는 첫 예정 회차를 기다려 주기 위한 것 — 그전에는 성공 기록 자체가 없다.

### 3.2 `backup.sh`

**설계 의도가 파일 상단 주석에 있다(`backup.sh:1-41`).** 요약하면 이 스크립트는 세 가지를
지킨다.

**① 삭제는 백업으로 전파되지 않는다.** 예전에는 `mc mirror --overwrite --remove` 였다.
소스에서 사라진 오브젝트를 백업에서도 지운다는 뜻이고, 그러면 실수로 지운 그날 밤 백업이
증거를 마저 없앤다 — 백업이 막아야 할 사고가 정확히 그 사고인데. 지금은 `--remove` 없이
`mc mirror --overwrite` 만 돌리고(`backup.sh:139`), 소스에서 사라진 파일은
`minio-trash/<ts>/` 로 **옮긴다**.
보존 기간이 지나야 지워진다(`:182-183`).

목록이 비어 보이면 격리를 통째로 건너뛴다(`:147`). "버킷이 진짜 비었다" 와 "목록을 못
읽었다" 를 구별할 수 없어서인데, 여기서 잘못 판단하면 이 스크립트가 막으려던 일을 스스로
하게 된다. 그래서 `mc find` 는 파이프가 아니라 파일로 받는다(`:144`) — `| sort` 로 넘기면
mc 가 실패해도 `sort` 가 0 을 내서 두 경우가 같아 보인다.

**② 끝까지 못 쓴 덤프는 남기지 않는다.** 예전에는 `pg_dump | gzip > out.sql.gz` 였다.
pg_dump 가 중간에 죽거나 디스크가 차면 `out.sql.gz` 는 **열리기는 하는 gzip** 으로 남는다.
파일이 있고 크기도 0 이 아니라서, 복구하려고 풀어 보기 전까지 아무도 모른다. 지금은
`.part` 에 쓰고 세 관문을 지나야 제자리로 간다:

| 관문                                         | 잡는 것                                |
| -------------------------------------------- | -------------------------------------- |
| pg_dump 종료 코드 (`backup.sh:112`)          | 접속 실패, 권한 오류                   |
| `gzip -t` (`:115`)                           | 압축 자체가 깨진 경우                  |
| `PostgreSQL database dump complete` (`:119`) | gzip 은 멀쩡한데 내용이 반만 있는 경우 |

파이프 앞쪽(pg_dump)의 실패는 파이프라인 종료 코드에 안 잡히므로 — gzip 이 0 을 내면
끝이다 — 실패 코드를 파일로 흘려서 본다(`:103-113`). BusyBox ash 의 `set -o pipefail` 에
기대지 않는다.

**③ 실패를 알린다.** cron 은 조용히 실패하고, `restart: unless-stopped` 인 컨테이너가 살아
있는 것과 백업이 실제로 돈 것은 `docker ps` 에서 똑같아 보인다. 검증을 전부 통과한 회차만
`last-success` 에 epoch 를 남기고(`:194`), `healthcheck.sh` 가 그 나이를 본다
(`healthcheck.sh:15-22`, 한도 `BACKUP_STALE_HOURS` 기본 26시간). `BACKUP_WEBHOOK_URL` 이
있으면 실패를 JSON POST 로도 던진다(`backup.sh:65-79`). 예상치 못한 경로로 죽어도 EXIT 트랩이
같은 알림을 낸다(`:83-90`).

보존 정리는 **성공한 회차에서만** 실행된다(`:180-183`). 실패가 이어지는 동안 정리만 돌면
마지막 성공본까지 지우기 때문이고, 실패는 그 위에서 `exit 1` 로 끊긴다.

### 3.3 원격 사본 — 아직 운영자 몫

`BACKUP_REMOTE_ENDPOINT` 를 채우면 매 회차 끝에 백업 디렉터리 전체를 외부 S3 로 밀어낸다
(`backup.sh:166-175`). 채우지 않으면 **백업이 원본과 같은 디스크에 있다** — 디스크가 죽으면
DB·오브젝트·백업이 함께 죽는다. 목적지는 사람이 정해야 해서 기본값을 둘 수 없다.

한 단계 약한 대안으로 `BACKUP_HOST_PATH` 에 다른 디스크/NAS 마운트 경로를 적으면 백업이
그쪽에 쌓인다(`full.yml:256-259`). 비우면 도커 볼륨(`backup_data`)이라 같은 디스크다.

`.env` 는 일부러 백업하지 않는다. 담긴 값이 그대로 외부 저장소로 나가면 그 저장소 하나가
뚫리는 순간 전부가 뚫린다. 잃으면 곤란한 것은 `MASTER_KEY` 하나뿐이니 그것만 사람이
비밀번호 관리자에 넣어 둔다. 그마저도 잃으면 사용자가 저장해 둔 BYOK 키만 못 읽고
(`apps/api/src/api-keys/crypto.ts:8-14`), 재입력하면 되며 그 외 데이터는 무관하다.

### 3.4 `entrypoint.sh` — cron 부트스트랩

- `env | awk` 로 `POSTGRES_/S3_/MINIO_/BACKUP_` 환경변수만 추출, shell-safe escape 후 `/app/env`에 export 라인 작성(`entrypoint.sh:6-13`). `BACKUP_WEBHOOK_URL`·`BACKUP_REMOTE_*` 도 접두사가 `BACKUP_` 이라 자동으로 포함된다.
- crontab에 `${BACKUP_SCHEDULE} . /app/env; /app/backup.sh >> /proc/1/fd/1 2>&1` 등록 (`:15-17`).
- `RUN_ON_START=1`이면 컨테이너 기동 즉시 1회 실행 (`:22-25`).
- `crond -f -l 8` foreground 실행 (`:27`).

볼륨은 `${BACKUP_HOST_PATH:-backup_data}:/backup` (`full.yml:259`).

---

## 4. `scripts/` — 유틸리티

여섯 개가 있고, 세 갈래다 — 배포 / 에셋 빌드 / 문서 검증.

| 스크립트                              | 실행 경로                     | 용도                                         |
| ------------------------------------- | ----------------------------- | -------------------------------------------- |
| `scripts/deploy.sh`                   | `pnpm run deploy`             | 손으로 하는 프로덕션 배포 (§8.2)             |
| `scripts/verify-doc-refs.ts`          | `pnpm verify:docs`            | `docs/*.md` 의 `path:line` 인용 검증         |
| `scripts/gen-landing-samples.ts`      | `pnpm samples:generate`       | 랜딩 샘플 이미지 생성                        |
| `scripts/optimize-landing-samples.ts` | `pnpm samples:optimize`       | 위 결과 → WebP 반응형 세트 + LQIP 매니페스트 |
| `scripts/build-fonts.py`              | (수동)                        | Pretendard 를 unicode-range 조각으로 분할    |
| `scripts/cmux-bootstrap.sh`           | `./scripts/cmux-bootstrap.sh` | cmux 개발 워크스페이스 생성                  |

`package.json:17-19`, `:24` 가 앞 네 개를 감싼다. `build-fonts.py` 와 `cmux-bootstrap.sh`
는 npm 스크립트가 없다.

### `scripts/build-fonts.py`

원본 `PretendardVariable.woff2` 는 2.0MB 이고 `next/font/local` 이 그걸 **모든 라우트에서
preload** 한다 (`scripts/build-fonts.py:7-10`). 코드포인트 순서로 N등분하면 한글은 초성별로 블록이
흩어져 있어 "로그인" 세 글자가 서로 다른 조각에 들어간다 — 조각을 잘게 낼수록 요청만
늘고 받는 총량은 안 준다 (`:17-19`). 그래서 **저장소가 실제로 쓰는 음절 700자 남짓**을 한
조각으로 모으고 나머지는 범위별로 둔다 (`:21-24`).

### `scripts/cmux-bootstrap.sh`

ComicAI 개발용 cmux 워크스페이스 `comicai-dev` 를 생성한다 (`cmux-bootstrap.sh:15-79`). 표준 레이아웃은 `docs/develop-docs/40-ops/04-cmux-workflow.md` 참조.

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

| 카테고리        | 변수                                                          | 기본/예시                                                           | 비고                                                                                                            |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **DB**          | `POSTGRES_USER` / `_PASSWORD` / `_DB`                         | `comicai`                                                           | compose 환경에 그대로 전달                                                                                      |
|                 | `DATABASE_URL`                                                | `postgresql://comicai:comicai@localhost:5433/comicai?schema=public` | 로컬 호스트는 `:5433`, 컨테이너 내부는 `postgres:5432` (full.yml의 `x-db-env`가 자동 오버라이드)                |
| **Redis**       | `REDIS_PASSWORD`                                              | (필수)                                                              | compose 가 이 값으로 `--requirepass` 를 건다 (`full.yml:70-71`). `:?` 로 강제 (`:25`)                           |
|                 | `REDIS_URL`                                                   | `redis://localhost:6379`                                            | compose 없이 직접 띄울 때만 쓴다. 컨테이너 안에서는 `x-api-env` 가 비밀번호를 넣어 조립 (`full.yml:25`)         |
| **S3 (MinIO)**  | `S3_ENDPOINT`                                                 | `http://localhost:9000`                                             | 컨테이너 내부는 `http://minio:9000`                                                                             |
|                 | `S3_PUBLIC_ENDPOINT`                                          | `http://localhost:9000`                                             | **브라우저용** presigned URL 서명 host (`.env.example:19`, `full.yml:16`)                                       |
|                 | `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `us-east-1` / `comicai` / `minioadmin` / `minioadmin`               |                                                                                                                 |
|                 | `MINIO_ROOT_USER` / `_PASSWORD`                               | `minioadmin`                                                        |                                                                                                                 |
| **보안**        | `MASTER_KEY`                                                  | (필수, 32-byte base64)                                              | AES-256-GCM KEK. `full.yml:26`에서 `:?` 로 강제                                                                 |
|                 | `COOKIE_SECURE`                                               | (비움)                                                              | 세션 쿠키의 Secure 플래그. **비우는 것이 기본** (`.env.example:47`, `full.yml:140`). §6.5 참고                  |
|                 | `COOKIE_DOMAIN`                                               | (비움)                                                              | web/api 가 다른 서브도메인일 때만 부모 도메인 (`.env.example:51`, `full.yml:141`)                               |
| **앱**          | `API_PORT`                                                    | `4000`                                                              |                                                                                                                 |
|                 | `WEB_PORT`                                                    | `3000`                                                              | `apps/web` `next dev -p ${WEB_PORT:-3000}`                                                                      |
|                 | `NEXT_PUBLIC_API_URL`                                         | `http://localhost:4000`                                             | Next 빌드 시 인라인 (`web.Dockerfile:29`)                                                                       |
|                 | `INTERNAL_API_URL`                                            | `http://api:4000`                                                   | full.yml 내부 server→server (`full.yml:202`)                                                                    |
|                 | `API_PUBLIC_URL`                                              | `http://localhost:4000`                                             | OAuth callback URL용 (`full.yml:146`)                                                                           |
|                 | `WEB_ORIGIN`                                                  | `http://localhost:3000`                                             | 한 값이 셋을 정한다 — CORS 허용 오리진, OAuth 콜백 리다이렉트, 메일 링크 (`.env.example:37-41`, `full.yml:135`) |
| **렌더 워커**   | `RENDER_WORKER_DISABLED`                                      | `0`                                                                 | api 컨테이너=1, worker 컨테이너=0                                                                               |
|                 | `RENDER_CONCURRENCY`                                          | `2`                                                                 | BullMQ 워커 동시성                                                                                              |
| **OAuth**       | `GOOGLE_OAUTH_CLIENT_ID/SECRET`                               | —                                                                   |                                                                                                                 |
|                 | `GITHUB_OAUTH_CLIENT_ID/SECRET`                               | —                                                                   |                                                                                                                 |
| **Cloudflare**  | `CLOUDFLARE_TUNNEL_TOKEN`                                     | —                                                                   | `--profile tunnel`일 때 필수                                                                                    |
| **백업**        | `BACKUP_SCHEDULE`                                             | `0 3 * * *`                                                         | cron expr                                                                                                       |
|                 | `BACKUP_RETENTION_DAYS`                                       | `14`                                                                |                                                                                                                 |
|                 | `BACKUP_RUN_ON_START`                                         | `0`                                                                 | 컨테이너 기동 직후 1회 실행                                                                                     |
|                 | `BACKUP_STALE_HOURS`                                          | `26`                                                                | healthcheck 한도. 스케줄을 성기게 바꾸면 같이 올린다 (`healthcheck.sh:13`)                                      |
|                 | `BACKUP_WEBHOOK_URL`                                          | —                                                                   | 실패 시 JSON POST. 비면 로그 + healthcheck 만 (`backup.sh:65-79`)                                               |
|                 | `BACKUP_HOST_PATH`                                            | (도커 볼륨)                                                         | 백업을 다른 디스크에 두려면 마운트 경로 (`full.yml:259`)                                                        |
|                 | `BACKUP_REMOTE_ENDPOINT/_ACCESS_KEY/_SECRET_KEY/_BUCKET`      | —                                                                   | 채우면 매 회차 외부 S3 로 사본 (`backup.sh:166-175`)                                                            |
| **운영자**      | `ADMIN_EMAILS`                                                | (비움)                                                              | `/admin` 접근 허용 이메일, 쉼표 구분. 비면 관리자 없음 (`.env.example:95`, `full.yml:28`)                       |
| **관측**        | `METRICS_TOKEN`                                               | (비움)                                                              | `/v1/metrics` Bearer 토큰. 비면 404 (`.env.example:102`, `full.yml:31`)                                         |
| **기능 플래그** | `FEATURE_API_KEYS`                                            | `0`                                                                 | BYOK 화면·API. 서버와 웹 둘 다 켜야 한다 (`.env.example:117`, `full.yml:29`)                                    |
|                 | `NEXT_PUBLIC_FEATURE_API_KEYS`                                | `0`                                                                 | 위의 웹 쪽 짝. 빌드 시 인라인 (`full.yml:194`)                                                                  |
| **메일**        | `RESEND_API_KEY`                                              | (비움)                                                              | 비면 콘솔 로그만 — 이메일 인증·비밀번호 재설정을 끝낼 수 없다 (`.env.example:123`, `full.yml:33`)               |
|                 | `EMAIL_FROM`                                                  | `ComicAI <onboarding@resend.dev>`                                   | 발신 주소 (`.env.example:125`, `full.yml:34`)                                                                   |
| **플랫폼 키**   | `PLATFORM_GEMINI_KEY` / `PLATFORM_OPENAI_KEY`                 | (비움)                                                              | 사용자 키가 없을 때 쓰는 회사 키 (`full.yml:36`, `:37`)                                                         |
|                 | `PLATFORM_DAILY_RENDER_LIMIT`                                 | `20`                                                                | 플랫폼 키 사용 시 1인 1일 상한. `0` 이면 무제한 (`full.yml:38`)                                                 |

> `apps/api`, `apps/web`에 별도 `.env.*`는 존재하지 않으며 루트 `.env` 만 사용.

> **`SESSION_SECRET` 은 없앴다.** `.env.example` 과 `full.yml` 이 그 이름을 요구했지만
> `apps/api` 안에서 읽는 곳이 한 군데도 없었다. 세션 식별자는 서명하지 않고,
> `urlSafeToken()` 으로 만든 난수를 Redis 에 저장한 뒤 그 키로 조회한다
> (`apps/api/src/auth/session.service.ts:48`). `cookieParser()` 도 secret 없이 부르므로
> (`apps/api/src/bootstrap.ts:34`) 서명 쿠키 자체가 불가능했다. 즉 **세션 위조를 막는 것은
> 서명이 아니라 난수의 예측 불가능성**이다.
>
> 지우기 전까지 이 이름은 함정이었다 — 세션을 전부 무효화하려고 이 값을 바꾸는 사람이
> 생기는데, 아무 일도 일어나지 않는다. 실제로 세션을 끊으려면 Redis 의 세션 키를 지운다.

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
| `5433` | Postgres (호스트 노출) | `dev.yml:15`                                                  |
| `6379` | Redis                  | `dev.yml:29`                                                  |
| `9000` | MinIO S3 API           | `dev.yml:47`                                                  |
| `9001` | MinIO Console          | `dev.yml:48`                                                  |

---

## 6.5 노출 표면

**의존 서비스 포트는 루프백에만 연다** — postgres(`full.yml:52`), redis(`:74`),
minio(`:92`, `:94`), api(`:156`), web(`:210`). docker 의 publish 는 `0.0.0.0` 바인딩이고 iptables 를
직접 건드리므로, 호스트 방화벽으로 막아도 인터넷에서 닿는다. 예전에는 이 넷이 전부
공개돼 있었고 **redis 는 비밀번호조차 없었다** — 세션과 렌더 큐가 들어 있으므로
읽히면 남의 세션을 그대로 쓸 수 있다. 지금은 `REDIS_PASSWORD` 가 필수다(`:70-71`, `:25` 에서 `:?` 로 강제).

> ⚠ api 를 루프백으로 옮기면서 확인할 것: 터널 라우팅은 Cloudflare 대시보드에 있어
> 이 저장소에서 볼 수 없다. public hostname 이 `http://api:4000`(도커 네트워크
> 이름)을 가리키면 안전하고, 호스트 주소(host.docker.internal)로 돼 있으면 닿지 않는다.

**`trust proxy` 는 포트를 닫은 뒤에 켠다**(`apps/api/src/bootstrap.ts:28`).
순서가 중요하다 — api 포트가 인터넷에 직접 열린 상태에서 먼저 켜면, 프록시를 건너뛴
요청이 `X-Forwarded-For` 를 마음대로 넣어 rate limit 을 완전히 무력화할 수 있다.
켜기 전에는 프록시 뒤 모든 요청의 IP 가 같아서, 한 명이 로그인을 몇 번 틀리면
그 1분 동안 전원이 로그인하지 못했다.

**`COOKIE_SECURE` 는 비워 두는 것이 기본이다.** 값이 있으면 코드의 "프로덕션이면
자동 켜기" 판정을 덮는다. 예전에는 compose 가 `${COOKIE_SECURE:-0}` 으로 **항상**
`0` 을 넘겨서 프로덕션 세션 쿠키에 Secure 가 안 붙었다. 빈 문자열도 같은 문제를
일으키므로 코드가 3상태로 읽는다(`apps/api/src/auth/session.service.ts:159`).
이 경계는 `session-cookie.spec.ts` 가 고정한다.

**`healthz` 는 의존성을 실제로 검사한다**(`apps/api/src/health/health.controller.ts:44`).
예전에는 상수만 돌려줘서, Postgres 가 죽어도 컨테이너는 영원히 healthy 였고 앞단은
계속 트래픽을 밀어 넣었다. 지금은 db/redis/s3 를 병렬로 재고 하나라도 죽으면 503 이다.
검사마다 2초 타임아웃이 걸려 있다 — 하나가 매달리면 "죽었다" 와 "응답이 없다" 를
구분할 수 없기 때문이다.

**응답 본문은 `{ ok, at }` 뿐이다.** 어느 의존성이 죽었는지는 서버 로그에만 남는다
(`health.controller.ts:79`) — 인증 없이 열린 엔드포인트에 내부 구성을 실어 보낼 이유가 없다.
운영 중 원인을 좁힐 때는 `docker compose logs api` 를 본다.

**요청 수가 아니라 검사 자체에 상한이 있다.** 분당 60회 스로틀(`:32`)에 더해 검사 결과를
2초간 재사용한다(`:16`). 무제한이었을 땐 이 엔드포인트가 요청마다 DB·Redis·S3 를 두드려
증폭 벡터가 됐다. 도커 헬스체크는 5초 간격이라 이 캐시에 걸리지 않는다 —
간격을 2초 아래로 줄인다면 이 값도 같이 봐야 한다(`infra/compose/full.yml:159`).

## 7. Cloudflare Tunnel

`infra/compose/full.yml:213-224` 에 `cloudflared` 서비스가 `profiles: ['tunnel']` 로 정의돼 있다(`:217`).

- 이미지: `cloudflare/cloudflared:latest`
- 커맨드: `tunnel --no-autoupdate run` (`:217`)
- 인증: `TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}` — Cloudflare Zero Trust 대시보드에서 발급한 토큰을 `.env`에 채워야 한다. 빈 값이면 즉시 종료 (`full.yml:219` 주석, `TUNNEL_TOKEN` `:220`).
- 의존: `web`, `api` (단순 `depends_on` `:222-224`, healthcheck 조건 없음)

활성화:

```sh
docker compose -f infra/compose/full.yml --profile tunnel up -d --build
```

외부 도메인으로 노출할 때는 추가로 다음을 조정한다.

- `S3_PUBLIC_ENDPOINT` — presigned URL의 서명 host (`.env.example:19`)
- `WEB_ORIGIN` — CORS 허용 오리진 + OAuth 콜백 리다이렉트 대상 + 인증·재설정 메일의 링크,
  세 가지를 한 값이 정한다 (`.env.example:37-41`)
- `API_PUBLIC_URL` — OAuth callback 정확한 외부 URL
- `COOKIE_SECURE` — https 라면 **건드리지 않는다**. 비어 있으면 `NODE_ENV=production` 에서
  자동으로 켜진다 (아래 §6.5 참고)
- `NEXT_PUBLIC_API_URL` — 외부 API URL (web 이미지 재빌드 필요)

---

## 8. 프로덕션 배포

### 8.1 자동 배포 — `main` push 트리거

`.github/workflows/deploy.yml:22-50` 의 `deploy` job 이 프로덕션 반영을 담당한다.
CI 와 분리된 별도 워크플로다 — 이유는 `docs/08-dev-workflow.md` §5 참고.

- 조건: `workflow_run` 으로 CI 를 받아 `conclusion == 'success'` 일 때만 (`deploy.yml:7-11`, `:32-35`). PR 에서는 실행되지 않고, CI(typecheck + test) 가 통과해야만 진행한다.
- 같은 `if` 가 `head_repository` 도 본다 (`deploy.yml:35`). 저장소가 공개라 이게 없으면 누구나 포크에서 브랜치를 `main` 으로 만들어 프로덕션 재기동을 트리거할 수 있다.
- 러너: `[self-hosted, comicai]` (`deploy.yml:37`) — 프로덕션 호스트 자체가 러너다.
- 작업 디렉터리: `secrets.PROD_REPO_PATH` (`deploy.yml:41`). **GitHub Secrets 에 `PROD_REPO_PATH` 가 등록돼 있어야 한다.**
- 수행 (`deploy.yml:42-50`):

```sh
git fetch --prune origin
git reset --hard origin/main
compose="docker compose -f infra/compose/full.yml --env-file .env --profile tunnel --profile backup"
$compose up -d --build --force-recreate web api worker
$compose up -d --build backup cloudflared
```

`git reset --hard` 이므로 프로덕션 호스트에 남은 로컬 변경은 유실된다. `.env` 는 git 추적 대상이 아니라 보존된다.

**마이그레이션 동반 실행**: `--force-recreate` 대상은 `web`/`api`/`worker` 3개지만, `api`·`worker` 가 `migrate` 를 `service_completed_successfully` 로 의존하므로(`full.yml:130-131`, `:179-180`) `migrate` 컨테이너가 함께 뜨며 `prisma migrate deploy` 가 실행된다(`full.yml:114`). 즉 **마이그레이션이 포함된 커밋을 `main` 에 push 하면 프로덕션 DB 스키마도 함께 변경된다.**

`postgres`·`redis`·`minio` 는 재생성 대상이 아니므로 그대로 유지된다.

**`backup`·`cloudflared` 는 두 번째 줄에서 따로 올린다**(`deploy.yml:50`, 주석 `:47-49`). profile 을 켜는
것과 컨테이너를 올리는 것은 다르다 — 예전에는 `--profile backup` 만 있고 서비스 이름이
없어서 배포가 백업 컨테이너를 **한 번도 띄우지 않았다**. 여기에 `--force-recreate` 를 빼 둔
것은 앱 배포마다 백업 cron 과 healthcheck 시작 유예(26h)가 리셋되지 않게 하기 위해서다.

### 8.2 수동 배포 / 운영 명령

`package.json:25-33` 의 `prod:*` 스크립트가 위와 동일한 compose 호출을 감싼다.

| 명령                              | 동작                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `pnpm prod:up`                    | 전체 스택 기동 (tunnel + backup profile 포함)               |
| `pnpm prod:up:app`                | `web`/`api`/`worker` 만 재빌드·재생성 — CI `deploy` 와 동일 |
| `pnpm prod:restart`               | `api` 만 재기동                                             |
| `pnpm prod:restart:web`           | `web` 만 재빌드·재기동                                      |
| `pnpm prod:ps` / `pnpm prod:logs` | 상태 확인 / 로그 추적                                       |
| `pnpm prod:logs:api`              | `api` 로그만 (tail 200)                                     |
| `pnpm prod:logs:tunnel`           | `cloudflared` 로그만                                        |
| `pnpm prod:down`                  | 전체 종료                                                   |

`docker:*` 스크립트(`package.json:20-23`)는 같은 compose 파일을 profile 없이 다루는 로컬 검증용이다.

**`scripts/deploy.sh` 는 위 job 을 손으로 돌리는 용도다**(`deploy.sh:2-3`). `origin/main` 을
받아 `web`/`api`/`worker` 를 재빌드·재기동한다.

```sh
pnpm run deploy              # fast-forward pull → 재기동
pnpm run deploy --reset      # origin/main 으로 강제 동기화 (커밋 안 된 로컬 변경 삭제)
pnpm run deploy --yes        # --reset 이 로컬 변경을 지울 때의 확인까지 건너뛴다
pnpm run deploy --no-pull    # 코드는 그대로 두고 컨테이너만 재기동
```

⚠ **`pnpm deploy` 가 아니라 `pnpm run deploy` 여야 한다.** `deploy` 는 pnpm 내장 명령이라
그냥 쓰면 가로채인다 (`deploy.sh:5`).

---

## 9. 파일 인덱스

- `infra/compose/dev.yml` — 인프라만
- `infra/compose/full.yml` — 전체 스택 + 옵션 profile (tunnel/backup)
- `infra/docker/api.Dockerfile` — NestJS api + worker
- `infra/docker/web.Dockerfile` — Next.js standalone
- `infra/backup/Dockerfile` · `backup.sh` · `entrypoint.sh` — 백업 사이드카
- `scripts/` — `deploy.sh` · `verify-doc-refs.ts` · `gen-landing-samples.ts` ·
  `optimize-landing-samples.ts` · `build-fonts.py` · `cmux-bootstrap.sh` (§4)
- `turbo.json` · `package.json` — pnpm/turbo 오케스트레이션
- `.env.example` — 환경변수 템플릿
