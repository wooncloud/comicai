import { describe, expect, it, vi, afterEach } from 'vitest';

/**
 * 가드는 세션의 이메일이 아니라 **DB 의 계정**을 본다. 인증 시각이 필요하기 때문이다.
 * 그래서 prisma 를 모킹한다.
 */
const findUnique = vi.fn();
vi.mock('@comicai/db', () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

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

/** DB 가 돌려줄 계정. `verified` 가 거짓이면 인증하지 않은 계정이다. */
function account(email: string, verified = true) {
  findUnique.mockResolvedValue({ email, emailVerifiedAt: verified ? new Date() : null });
}

const ORIG = process.env.ADMIN_EMAILS;
afterEach(() => {
  findUnique.mockReset();
  if (ORIG === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIG;
});

describe('AdminGuard', () => {
  it('허용 목록의 인증된 사용자는 통과', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    account('owner@example.com');
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).resolves.toBe(true);
  });

  /*
   * DB 는 citext 라 이메일이 대소문자 구분 없이 유일하지만, 저장된 표기가 과거
   * 데이터라 섞여 있을 수 있다. 판정은 그와 무관해야 한다.
   */
  it('저장된 표기의 대소문자가 달라도 통과', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    account('OWNER@Example.com');
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).resolves.toBe(true);
  });

  /*
   * 핵심 회귀 방지. 목록의 이메일에 아직 계정이 없으면 그 주소를 아는 사람이
   * 먼저 가입해 선점할 수 있다 — 공개 저장소라 운영자 이메일은 git log 에 보인다.
   * 메일함을 실제로 가진 사람만 통과해야 한다.
   */
  it('이메일을 인증하지 않았으면 403 (선점 가입 차단)', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    account('owner@example.com', false);
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).rejects.toThrow();
  });

  it('목록에 없으면 403', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    account('other@example.com');
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u2', email: 'other@example.com' })),
    ).rejects.toThrow();
  });

  it('세션이 없으면 403 (통과시키지 않는다)', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    await expect(new AdminGuard().canActivate(ctx(undefined))).rejects.toThrow();
  });

  it('세션은 있으나 계정이 지워졌으면 403', async () => {
    const { AdminGuard } = await loadGuard('owner@example.com');
    findUnique.mockResolvedValue(null);
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).rejects.toThrow();
  });

  it('ADMIN_EMAILS 미설정이면 아무도 통과하지 못한다', async () => {
    const { AdminGuard } = await loadGuard(undefined);
    account('owner@example.com');
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).rejects.toThrow();
  });

  it('빈 문자열도 마찬가지', async () => {
    const { AdminGuard } = await loadGuard('');
    account('owner@example.com');
    await expect(
      new AdminGuard().canActivate(ctx({ id: 'u1', email: 'owner@example.com' })),
    ).rejects.toThrow();
  });
});
