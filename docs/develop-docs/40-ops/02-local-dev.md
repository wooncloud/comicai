# 로컬 개발 환경

> v0.1 — 2026-05-16 — Draft

## 사전 요구사항

- Node 20+
- pnpm 9+
- Docker Desktop (또는 OrbStack)
- cmux (선택, 권장)

## 최초 셋업

```bash
git clone <repo>
cd comicai
pnpm install
cp .env.example .env
# .env 편집: MASTER_KEY 등 생성
docker compose -f infra/compose/dev.yml up -d postgres redis minio
pnpm --filter db migrate dev
pnpm --filter api seed   # 선택, 데모 데이터
```

## 개발 모드 실행

```bash
pnpm dev   # web + api + worker를 turborepo로 동시 실행
```

또는 cmux 사용 시:

```bash
./scripts/cmux-bootstrap.sh
```

→ [`04-cmux-workflow.md`](./04-cmux-workflow.md) 참조.

## 자주 쓰는 명령

| 목적              | 명령                                         |
| ----------------- | -------------------------------------------- |
| 마이그레이션 추가 | `pnpm --filter db migrate dev --name <slug>` |
| DB GUI            | `pnpm --filter db studio` (Prisma Studio)    |
| 단위 테스트       | `pnpm test`                                  |
| E2E               | `pnpm e2e`                                   |
| 타입 체크         | `pnpm typecheck`                             |
| Lint              | `pnpm lint`                                  |
| 빌드              | `pnpm build`                                 |

## 트러블슈팅

- `EADDRINUSE`: 다른 프로세스가 3000/4000 사용 중. `lsof -ti:3000 | xargs kill`.
- DB 연결 실패: `docker compose ps`로 postgres 컨테이너 상태 확인.
- 마이그레이션 충돌: `pnpm --filter db migrate reset`.

## 변경 이력

- 2026-05-16: 초기 작성
