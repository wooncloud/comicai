import { expect, test } from '@playwright/test';

const password = 'Pa55word!ok';

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test('signup → dashboard 진입 + 프로젝트 생성', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/signup');
  await page.getByLabel(/이메일|email/i).fill(email);
  await page.getByLabel(/비밀번호|password/i).fill(password);
  await page.getByRole('button', { name: /가입|sign up/i }).click();

  await page.waitForURL(/\/(dashboard|projects)/, { timeout: 20_000 });
  await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });

  const newName = `E2E ${Date.now()}`;
  await page
    .getByRole('button', { name: /새 프로젝트|프로젝트 만들기|create/i })
    .first()
    .click();
  await page.getByLabel(/이름|name/i).fill(newName);
  await page.getByRole('button', { name: /만들기|생성|create/i }).click();
  await expect(page.getByText(newName)).toBeVisible();
});
