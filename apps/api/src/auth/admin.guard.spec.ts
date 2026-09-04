import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * AdminGuard 는 모듈 로드 시점에 ADMIN_EMAILS 를 읽는다.
 * 그래서 환경변수를 바꾼 뒤 모듈을 다시 import 해야 한다.
 */
async function loadGuard(adminEmails: string | undefined) {
  vi.resetModules();
  if (adminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = adminEmails;
  return import('./admin.guard');
}

function ctx(user?: { id: string; email: string }) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never;
}

const ORIG = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (ORIG === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIG;
});

describe('AdminGuard', () => {
  it('허용 목록의 사용자는 통과', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    expect(new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' }))).toBe(true);
  });

  it('대소문자가 달라도 통과', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    expect(new AdminGuard().canActivate(ctx({ id: 'u1', email: 'OWNER@Example.com' }))).toBe(true);
  });

  it('목록에 없으면 403', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    expect(() =>
      new AdminGuard().canActivate(ctx({ id: 'u2', email: 'other@example.com' })),
    ).toThrow();
  });

  it('세션이 없으면 403 (통과시키지 않는다)', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    expect(() => new AdminGuard().canActivate(ctx(undefined))).toThrow();
  });

  it('ADMIN_EMAILS 미설정이면 아무도 통과하지 못한다', async () => {
    const { AdminGuard } = await loadGuard(undefined);
    expect(() =>
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).toThrow();
  });

  it('빈 문자열도 마찬가지', async () => {
    const { AdminGuard } = await loadGuard('');
    expect(() =>
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).toThrow();
  });
});
