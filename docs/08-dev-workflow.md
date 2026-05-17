# 08. 개발 워크플로우 & 테스트

> 작성일: 2026-05-17
> 본 문서는 실제 리포지토리 상태(`package.json`, `turbo.json`, `.husky/`, `.github/workflows/`, git log)를 근거로 정리한 **현실 기준** 가이드다. 계획 문서인 `docs/develop-docs/40-ops/06-git-workflow.md`와 차이가 있는 부분은 본문에서 명시한다.

---

## 1. 사전 요구사항

- Node.js **>= 20** (`package.json:6-8`)
- pnpm **9.12.0** (`package.json:5`, packageManager 핀)
- Docker / Docker Compose (Postgres / Redis / MinIO 의존)

## 2. 최초 셋업

```bash
# 1) 저장소 루트에서 의존성 설치 (husky prepare 훅도 같이 실행됨)
pnpm install

# 2) 환경변수 파일 복사 후 시크릿 채우기
cp .env.example .env
#   - MASTER_KEY: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   - SESSION_SECRET: 32바이트 random hex
#   - 필요 시 GOOGLE_OAUTH_*, GITHUB_OAUTH_* 채움

# 3) 인프라(postgres/redis/minio) 기동
docker compose -f infra/compose/dev.yml up -d

# 4) Prisma 클라이언트 생성 + 마이그레이션 적용
pnpm --filter @comicai/db generate
pnpm --filter @comicai/db migrate
```

근거:

- `.env.example:1-57` — 환경 변수 목록 및 주석.
- `infra/compose/dev.yml:1-58` — postgres(5433), redis(6379), minio(9000/9001).
- `packages/db/package.json:9-13` — `generate` / `migrate` / `migrate:deploy` / `studio` 스크립트.

> `infra/compose/full.yml`은 web/api/worker 컨테이너 풀스택용. 로컬 개발에선 `dev.yml`(의존 서비스만)이 기본.

## 3. 일상 명령

### 루트 (Turbo)

| 명령             | 설명                                           | 정의                                  |
| ---------------- | ---------------------------------------------- | ------------------------------------- |
| `pnpm dev`       | 모든 워크스페이스 `dev` 병렬 실행 (persistent) | `package.json:10`, `turbo.json:14-17` |
| `pnpm build`     | 모든 패키지/앱 빌드, `^build` 의존             | `package.json:11`, `turbo.json:5-8`   |
| `pnpm typecheck` | 전체 타입체크. `^build` 먼저                   | `package.json:13`, `turbo.json:19-21` |
| `pnpm lint`      | 전체 lint                                      | `package.json:12`, `turbo.json:18`    |
| `pnpm test`      | 전체 unit 테스트. `^build` 먼저                | `package.json:14`, `turbo.json:22-24` |
| `pnpm format`    | Prettier write                                 | `package.json:15`                     |

`@comicai/api#dev`는 `types/db/events/adapters` 빌드를 먼저 끝낸 뒤 기동된다 (`turbo.json:9-13`).

### apps/api (NestJS + Vitest)

`apps/api/package.json:5-15`

- `pnpm --filter @comicai/api dev` — `nest start --watch` (HTTP + 워커 인프로세스. `RENDER_WORKER_DISABLED=0`)
- `pnpm --filter @comicai/api dev:worker` — 워커 단독 (`--entryFile worker`)
- `pnpm --filter @comicai/api build` — `nest build`
- `pnpm --filter @comicai/api start` / `start:worker` — 빌드 산출물 기동
- `pnpm --filter @comicai/api typecheck` — `tsc --noEmit`
- `pnpm --filter @comicai/api lint` — `eslint src/**/*.ts`
- `pnpm --filter @comicai/api test` — **Vitest** 단위 (`src/**/*.spec.ts`)
- `pnpm --filter @comicai/api test:integration` — Vitest 통합 (testcontainers)

### apps/web (Next.js + Playwright)

`apps/web/package.json:5-13`

- `pnpm --filter @comicai/web dev` — `next dev -p ${WEB_PORT:-3000}`
- `pnpm --filter @comicai/web build` — `next build`
- `pnpm --filter @comicai/web start` — production 기동
- `pnpm --filter @comicai/web lint` — `next lint`
- `pnpm --filter @comicai/web typecheck` — `tsc --noEmit`
- `pnpm --filter @comicai/web e2e:install` — Playwright 브라우저 최초 1회 설치
- `pnpm --filter @comicai/web e2e` — Playwright 실행

### packages/db (Prisma)

`packages/db/package.json:7-13`

- `pnpm --filter @comicai/db generate` — `prisma generate`
- `pnpm --filter @comicai/db migrate` — `prisma migrate dev`
- `pnpm --filter @comicai/db migrate:deploy` — 배포용
- `pnpm --filter @comicai/db studio` — Prisma Studio

## 4. 테스트 프레임워크

### 4.1 단위: Vitest (api 한정)

설정: `apps/api/vitest.config.ts:1-17`

- include: `src/**/*.spec.ts`
- exclude: `test/integration/**`
- env: `node`, globals 꺼짐 (명시 import)
- coverage: v8, `text` + `lcov`, `*.module.ts` / `main.ts` / `worker.ts` 제외

웹 앱(`apps/web`)에는 Vitest/Jest가 없다. UI 검증은 Playwright E2E로만 수행한다.

### 4.2 통합: Vitest + Testcontainers

설정: `apps/api/vitest.integration.config.ts:1-18`

- include: `test/integration/**/*.spec.ts` (예: `apps/api/test/integration/auth.integration.spec.ts`, `setup.ts`)
- timeout: 120s, hookTimeout 120s, pool `forks` + `singleFork: true`
- 의존성: `@testcontainers/postgresql`, `@testcontainers/redis` (`apps/api/package.json:46-55`) → 로컬에 Docker 데몬 필요.

### 4.3 E2E: Playwright

설정: `apps/web/playwright.config.ts:1-40`

- testDir: `./e2e` (현재 `apps/web/e2e/auth.spec.ts` 한 개)
- baseURL: `process.env.E2E_BASE_URL ?? http://localhost:3000`
- workers 1, `fullyParallel: false`, CI에선 retries 2 / `forbidOnly`
- 트레이스/스크린샷/비디오 모두 `retain-on-failure`
- webServer: 기본은 `pnpm dev`를 Playwright가 띄움. `E2E_NO_SERVER=1`이면 외부에서 미리 띄운 서버 사용
- 실행 전제(설정 코멘트 9-15행):
  1. `docker compose -f infra/compose/dev.yml up -d`
  2. `pnpm --filter @comicai/api dev`
  3. (최초 1회) `pnpm --filter @comicai/web e2e:install`
  4. `pnpm --filter @comicai/web e2e`

## 5. CI

`.github/workflows/ci.yml:1-39`

- 트리거: `push` → `main`, 모든 `pull_request`
- concurrency: 동일 ref의 이전 실행을 취소 (`ci.yml:8-10`)
- 단일 job `build` (ubuntu-latest, 15분 타임아웃):
  1. checkout
  2. pnpm 9.12.0 / Node 20 (`pnpm` 캐시)
  3. `pnpm install --frozen-lockfile`
  4. `pnpm -r --filter "./packages/*" build` — 워크스페이스 패키지 선빌드
  5. `pnpm typecheck`
  6. `pnpm test`

> 주의: CI는 현재 **lint, E2E, integration 테스트를 실행하지 않는다.** 통합 테스트는 Docker 데몬이 필요하고, E2E는 별도 인프라가 필요해 로컬·온디맨드로 돌리는 구조다. 계획서 `develop-docs/40-ops/06-git-workflow.md:147`이 명시한 "lint/typecheck/unit/integration 통과"와는 차이가 있으니, 머지 전엔 로컬에서 누락 단계를 직접 돌릴 것.

## 6. Git 훅

- 도구: **Husky v9** (`package.json:24`). `prepare` 스크립트가 `husky`를 호출 (`package.json:16`).
- `pre-commit` 훅: `.husky/pre-commit:1`
  ```sh
  pnpm exec lint-staged
  ```
- lint-staged 설정: `package.json:18-22`
  ```json
  "*.{ts,tsx,js,json,md,css}": ["prettier --write"]
  ```

> 실제 훅은 **Prettier 포맷팅만** 수행한다. 계획서(`06-git-workflow.md:151-158`)에 적힌 `lint --fix` / `typecheck` / `test --changed`는 아직 구현되어 있지 않다. 타입/테스트는 푸시 전 본인이 명시적으로 돌려야 한다.

## 7. 커밋 컨벤션 (실측)

최근 30개 커밋(`git log --oneline -30`)에서 관찰된 형식:

```
<type>(<scope>): <한국어 제목>
```

- 사용된 type: `feat`, `fix`, `refactor`, `chore`, `docs`(드뭄), `test`
- 마일스톤 진행 시 scope에 단계 코드를 함께 사용: `feat(p0)`, `feat(p1)`, … `feat(p7)` / `refactor(simplify)`.
- 도메인 scope 예: `feat(editor)`, `feat(render)`, `feat(consistency)`, `feat(panel-shape)`, `feat(infra)`, `chore(editor)`, `fix(panel)`, `fix(export)`, `fix(auth)`, `chore(models)`.
- 제목은 한국어 명령형/명사구 혼용, 마침표 없음. 예:
  - `refactor(simplify): P7B — 패널 모양/도구 묶음 리뷰 반영`
  - `fix(export): 패널 알파 마스크가 적용되지 않던 버그`
  - `feat(p6): Ops - 워커 분리 / cloudflared / 백업 cron / 테스트 인프라`
- **금지 사항**(글로벌 지침 `~/.claude/CLAUDE.md` 및 `develop-docs/40-ops/06-git-workflow.md:171-176`):
  - `Co-Authored-By` 라인 금지
  - `🤖 Generated with …` 자동 서명 금지

세부 규칙(Conventional Commits / type 표 / scope 표준 / footer)은 `docs/develop-docs/40-ops/06-git-workflow.md:26-96`에 정리되어 있다.

## 8. 브랜치 & PR 흐름

계획 문서 `develop-docs/40-ops/06-git-workflow.md:16-25, 112-149`에는 다음이 규정되어 있다.

- 브랜치: `main`(항상 배포 가능) / `feature/M{N}-{agent}-{slug}` / `fix/{slug}` / `chore/{slug}`
- 에이전트별 worktree 디렉터리: `worktrees/{agent}/`
- 머지: PR + Squash(소규모) 또는 Rebase(시리즈 의미 있음)
- PR 제목: `[A-{Agent}] feat(scope): subject`
- PR 본문 템플릿: 변경사항 / 이유 / 관련 문서 / 테스트 체크박스(unit/integration/e2e/시각회귀) / 영향 범위 / DO NOT TOUCH 위반 여부
- 머지 조건(계획): CI 통과 + 리뷰어 1명 이상 + 인터페이스 변경 시 의존 에이전트 확인
- `main` 직접 push / force-push 금지, Squash/Rebase만 허용

**현실 갭**:

- 현재 리포지토리는 `main` 단일 브랜치 운영 흔적이 강하다 (`git status` clean, 최근 커밋이 모두 `main` 위 직선). PR/머지 보호 규칙은 코드로는 검증할 수 없고 GitHub 설정에 의존한다.
- CI가 실행하는 것은 typecheck + unit test뿐(7장 참조). lint / integration 통과를 자동 게이트로 강제하지 않으므로, PR 본문 체크박스를 실제 명령으로 본인이 돌릴 책임이 있다.

## 9. 권장 머지 전 체크리스트

```bash
# 1) 포맷/타입/단위
pnpm format
pnpm typecheck
pnpm test

# 2) (도메인 변경 시) 통합 — Docker 필요
pnpm --filter @comicai/api test:integration

# 3) (UX 변경 시) E2E
docker compose -f infra/compose/dev.yml up -d
pnpm --filter @comicai/api dev      # 다른 터미널
pnpm --filter @comicai/web e2e
```

## 10. 참고 파일

- 루트 스크립트: `/Users/wooncloud/project/comicai/package.json`
- Turbo 파이프라인: `/Users/wooncloud/project/comicai/turbo.json`
- CI: `/Users/wooncloud/project/comicai/.github/workflows/ci.yml`
- Husky: `/Users/wooncloud/project/comicai/.husky/pre-commit`
- API Vitest: `/Users/wooncloud/project/comicai/apps/api/vitest.config.ts`, `vitest.integration.config.ts`
- Web Playwright: `/Users/wooncloud/project/comicai/apps/web/playwright.config.ts`
- Compose: `/Users/wooncloud/project/comicai/infra/compose/dev.yml`, `full.yml`
- 환경 변수: `/Users/wooncloud/project/comicai/.env.example`
- 커밋/PR 규칙(계획): `/Users/wooncloud/project/comicai/docs/develop-docs/40-ops/06-git-workflow.md`
