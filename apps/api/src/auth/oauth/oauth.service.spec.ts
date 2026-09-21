import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import type { UsersService } from '../../users/users.service';

const findUniqueMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@comicai/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisQuit = vi.fn();
vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      get = mockRedisGet;
      set = mockRedisSet;
      del = mockRedisDel;
      quit = mockRedisQuit;
    },
  };
});

const exchangeAndFetchMock = vi.fn();
const authorizationUrlMock = vi.fn();
vi.mock('./oauth.providers', () => ({
  ADAPTERS: {
    google: {
      authorizationUrl: (...args: unknown[]) => authorizationUrlMock(...args),
      exchangeAndFetch: (...args: unknown[]) => exchangeAndFetchMock(...args),
    },
  },
}));

describe('OAuthService (OAuth 가입 및 로그인)', () => {
  let config: ConfigService;
  let createUserMock: ReturnType<typeof vi.fn>;
  let users: UsersService;
  let service: OAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      get: vi.fn((key: string) => {
        if (key === 'GOOGLE_OAUTH_CLIENT_ID') return 'mock-client-id';
        if (key === 'GOOGLE_OAUTH_CLIENT_SECRET') return 'mock-client-secret';
        if (key === 'API_PUBLIC_URL') return 'http://localhost:4000';
        return undefined;
      }),
    } as unknown as ConfigService;
    createUserMock = vi.fn();
    users = { createUser: createUserMock } as unknown as UsersService;
    service = new OAuthService(config, users);
  });

  it('신규 OAuth 사용자는 UsersService.createUser 를 호출하여 생성하고 1회 지급을 보장한다', async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ provider: 'google', returnTo: '/custom-return' }),
    );
    exchangeAndFetchMock.mockResolvedValue({
      email: 'oauth-new@example.com',
      emailVerified: true,
      displayName: 'OAuth New',
      avatarUrl: 'https://example.com/avatar.png',
    });
    findUniqueMock.mockResolvedValue(null);
    createUserMock.mockResolvedValue({
      id: 'user_oauth_123',
      email: 'oauth-new@example.com',
    });

    const res = await service.completeAuth('google', 'code_123', 'state_abc', 'state_abc');

    expect(createUserMock).toHaveBeenCalledTimes(1);
    expect(createUserMock).toHaveBeenCalledWith({
      email: 'oauth-new@example.com',
      displayName: 'OAuth New',
      avatarUrl: 'https://example.com/avatar.png',
      oauthProviders: ['google'],
      emailVerifiedAt: expect.any(Date),
      termsAgreedAt: expect.any(Date),
    });
    expect(res).toEqual({
      userId: 'user_oauth_123',
      email: 'oauth-new@example.com',
      returnTo: '/custom-return',
    });
  });

  it('기존 계정이 존재하면 계정을 연동하고 createUser 를 부르지 않는다 (중복 지급 방지)', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ provider: 'google', returnTo: null }));
    exchangeAndFetchMock.mockResolvedValue({
      email: 'existing@example.com',
      emailVerified: true,
      displayName: 'Existing User',
      avatarUrl: null,
    });
    findUniqueMock.mockResolvedValue({
      id: 'user_existing_456',
      email: 'existing@example.com',
      oauthProviders: [],
      emailVerifiedAt: new Date(),
    });
    updateMock.mockResolvedValue({});

    const res = await service.completeAuth('google', 'code_123', 'state_abc', 'state_abc');

    expect(createUserMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      userId: 'user_existing_456',
      email: 'existing@example.com',
      returnTo: null,
    });
  });

  it('기존 계정이 있으나 제공자의 이메일이 미인증이면 OAUTH_EMAIL_UNVERIFIED 예외를 던진다', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ provider: 'google', returnTo: null }));
    exchangeAndFetchMock.mockResolvedValue({
      email: 'unverified@example.com',
      emailVerified: false,
      displayName: null,
      avatarUrl: null,
    });
    findUniqueMock.mockResolvedValue({
      id: 'user_unverified',
      email: 'unverified@example.com',
      oauthProviders: [],
      emailVerifiedAt: null,
    });

    await expect(
      service.completeAuth('google', 'code_123', 'state_abc', 'state_abc'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createUserMock).not.toHaveBeenCalled();
  });
});
