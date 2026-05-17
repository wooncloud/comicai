# 프로젝트 규칙

## docs ↔ 코드 동기화

`docs/*.md` (단, `docs/develop-docs/`는 제외) 는 코드와 `path:line` 인용으로 묶여 있다.
인용 검증은 `pnpm verify:docs` (CI: `.github/workflows/docs-drift.yml`).

다음 변경이 포함된 커밋/PR 을 만들 땐 **PR 본문(또는 커밋 메시지) 에 "관련 docs 갱신 필요 여부" 를 한 줄 명시**한다 (`필요` / `없음` / `TODO`):

- 코드 라인 50줄 이상 변경
- 새 파일/모듈 추가 또는 기존 모듈 삭제
- 공개 API/DTO/Zod 스키마/Prisma 모델 변경

영역별 매핑:

| 코드 변경                | 갱신 후보 docs               |
| ------------------------ | ---------------------------- |
| `apps/web/**`            | `docs/03-frontend.md`        |
| `apps/api/**`            | `docs/02-backend.md`         |
| `packages/**`            | `docs/04-shared-packages.md` |
| `infra/**`, `compose/**` | `docs/05-infra-ops.md`       |
| `packages/db/prisma/**`  | `docs/07-data-model.md`      |
| 렌더 파이프라인 관련     | `docs/06-render-pipeline.md` |

마이그레이션/리팩터링 직후엔 `/sync-docs <영역>` 실행을 권장한다.

### 핵심 원칙

- **`docs/*.md` (develop-docs/ 제외) 는 모든 코드 설명에 `path:line` 인용을 동반해야 한다.** 인용 없는 코드 설명은 사실상 stale 위험.
- **큰 마이그레이션 직후 또는 모듈 단위 변경 후엔 반드시 `/sync-docs <영역>` 으로 점검할 것.** 라인 시프트는 grep으로 빠르게 따라잡힌다.
