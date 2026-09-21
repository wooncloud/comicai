import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UsersService } from './users.service';
import type { TokensService } from '../tokens/tokens.service';

const createMock = vi.fn();
vi.mock('@comicai/db', () => ({
  newId: (prefix: string) => `${prefix}_test_id`,
  prisma: {
    user: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

describe('UsersService', () => {
  let grantSignupBonus: ReturnType<typeof vi.fn>;
  let tokens: TokensService;
  let service: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    grantSignupBonus = vi.fn().mockResolvedValue(undefined);
    tokens = { grantSignupBonus } as unknown as TokensService;
    service = new UsersService(tokens);
  });

  it('사용자를 생성하고 가입 축하 토큰을 1회 지급한다', async () => {
    const fakeUser = {
      id: 'user_test_id',
      email: 'test@example.com',
      passwordHash: 'hash',
      termsAgreedAt: new Date(),
    };
    createMock.mockResolvedValue(fakeUser);

    const agreedAt = new Date('2026-09-21T00:00:00Z');
    const result = await service.createUser({
      email: '  TEST@Example.com  ',
      passwordHash: 'hash',
      termsAgreedAt: agreedAt,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'user_test_id',
        email: 'test@example.com',
        passwordHash: 'hash',
        termsAgreedAt: agreedAt,
      }),
    });
    expect(grantSignupBonus).toHaveBeenCalledTimes(1);
    expect(grantSignupBonus).toHaveBeenCalledWith('user_test_id');
    expect(result).toBe(fakeUser);
  });

  it('지급이 실패하면 예외가 전파된다', async () => {
    createMock.mockResolvedValue({ id: 'user_test_id', email: 'test@example.com' });
    grantSignupBonus.mockRejectedValue(new Error('원장 저장 실패'));

    await expect(
      service.createUser({ email: 'test@example.com', termsAgreedAt: null }),
    ).rejects.toThrow('원장 저장 실패');
  });

  it('동의 없이 만드는 계정에는 동의 시각을 지어내지 않는다', async () => {
    createMock.mockResolvedValue({ id: 'user_invited', email: 'invited@example.com' });

    await service.createUser({ email: 'invited@example.com', termsAgreedAt: null });

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ termsAgreedAt: null }),
    });
  });
});
