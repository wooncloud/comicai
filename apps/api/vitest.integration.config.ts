import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * 통합 테스트는 Docker(testcontainers)에 의존하므로 별도 실행.
 *   pnpm --filter @comicai/api test:integration
 *
 * **SWC 로 변환해야 한다.** vitest 기본 변환기(esbuild)는 `emitDecoratorMetadata` 를
 * 지원하지 않아서 `design:paramtypes` 가 사라지고, 그러면 Nest 가 생성자 인자 타입을
 * 몰라 `undefined` 를 주입한다. 증상은 DI 오류가 아니라 **런타임 TypeError** 다 —
 * 실제로 `new SessionService` 에서 "Cannot read properties of undefined (reading 'get')"
 * 로 죽었고, `logger: false` 때문에 그 메시지조차 보이지 않았다.
 *
 * 그래서 이 스위트는 만들어진 뒤로 한 번도 통과한 적이 없었다. CI 도 돌리지 않아
 * 아무도 몰랐다.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    /*
     * **스펙 파일마다 별도 fork.** 한 프로세스를 공유하면 안 된다.
     *
     * `@comicai/db` 의 `prisma` 는 모듈 싱글턴이고 `globalThis` 에 캐시된다. 각
     * 스펙이 자기 컨테이너를 띄우는데, 프로세스를 공유하면 두 번째 스펙이 첫 번째
     * 스펙의(이미 종료된) 컨테이너에 붙은 클라이언트를 그대로 물려받는다 —
     * "terminating connection due to administrator command" 로 죽는다.
     *
     * 컨테이너를 두 벌 띄우는 대가는 있지만, 스펙 사이 상태 격리가 더 중요하다.
     */
    pool: 'forks',
    isolate: true,
  },
});
