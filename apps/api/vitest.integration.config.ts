import { defineConfig } from 'vitest/config';

// 통합 테스트는 Docker(testcontainers)에 의존하므로 별도 실행.
//   pnpm --filter @comicai/api test:integration
export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
