import { loadEnv } from '@comicai/config';

/**
 * 설정 로딩. **모든 것보다 먼저 실행돼야 한다.**
 *
 * 진입점(`main.ts`, `worker.ts`)이 `reflect-metadata` 다음, 다른 어떤 모듈보다 앞에서
 * 이 파일을 import 한다. 늦으면 소용이 없다 — `admin.guard.ts` 의 `ADMIN_EMAILS` 나
 * `session.service.ts` 의 `COOKIE_DOMAIN` 처럼 **모듈이 로드되는 순간 한 번 읽고 마는**
 * 값들이 있어서, NestJS 의 `ConfigModule` 이 `.env` 를 읽을 때는 이미 지나간 뒤다.
 * (그래서 예전에는 로컬 `pnpm dev` 에서 `.env` 의 `ADMIN_EMAILS` 가 조용히 무시됐다.)
 *
 * 우선순위는 실제 환경변수 > `.env` > `env-profile.json` 이고, 그 규칙은
 * `packages/config/index.js` 하나가 안다. 여기서는 부르기만 한다.
 */
export const ENV_PROFILE = loadEnv();
