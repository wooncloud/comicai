import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 설정.
 *  - testDir: apps/web/e2e/**
 *  - webServer: pnpm dev (별도로 인프라/API를 사전에 띄워야 함)
 *  - baseURL: localhost:3000
 *
 * 실행 전:
 *   docker compose -f infra/compose/dev.yml up -d
 *   pnpm --filter @comicai/api dev
 * 그 다음:
 *   pnpm --filter @comicai/web e2e:install   # 최초 1회
 *   pnpm --filter @comicai/web e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
