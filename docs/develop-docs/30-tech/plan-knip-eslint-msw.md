# 개발 하네스 도입 계획 — Knip · ESLint · MSW

## 배경

프로젝트 분석(docs/01-08) 후 우선 효과가 큰 3개 하네스를 단계별로 도입한다. 모두 같은 브랜치, 별도 커밋.

## 1. Knip (완료)

- 루트에 `knip` devDep 추가, `knip.json` 작성, `pnpm knip` 스크립트 추가.
- 모노레포 워크스페이스(`apps/web`, `apps/api`, `packages/*`) 엔트리 설정.
- 첫 실행 베이스라인:
  - **Unused files**: `apps/web/lib/theme.ts`, `packages/adapters/src/_alias.ts`
  - **Unused deps**: `multer`, `@types/multer` (apps/api)
  - **Unused devDeps**: `@nestjs/testing`, `pino-pretty`, `testcontainers` (apps/api)
  - **Unlisted deps**: `@nestjs/schematics`, `@vitest/coverage-v8`, `eslint`
  - **Unused exports**: 14개 (UI 컴포넌트의 Radix 재export 포함)
  - **Unused exported types**: `BoundingBox`
- 정리 작업은 본 도입과 분리해 별도 PR/커밋으로 진행.

## 2. ESLint (다음 단계)

- 공유 패키지 `packages/eslint-config` (`@comicai/eslint-config`) 생성, flat config.
- 베이스 규칙: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-import` no-cycle + `eslint-plugin-react-hooks` exhaustive-deps.
- apps/web: 기존 `next lint`를 `eslint .`로 교체하며 `eslint-config-next` 흡수.
- apps/api: `eslint .` 신규.
- packages/\*: 동일.
- lint-staged에 `eslint --fix` 추가 (prettier 앞쪽에).

## 3. MSW (마지막)

- `apps/web`에 `msw` devDep, `mocks/handlers.ts` + `mocks/server.ts` (node, Vitest용) + `mocks/browser.ts` (선택).
- Vitest setup에 `server.listen({ onUnhandledRequest: 'error' })` 연결.
- 샘플 테스트: dashboard `useQuery(['projects'])`가 `/api/v1/projects` 모킹된 응답을 그대로 그리는지.
- e2e(Playwright)는 본 단계에서 건드리지 않음.
