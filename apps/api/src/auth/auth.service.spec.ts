import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { AuthService } from './auth.service';
import type { UsersService } from '../users/users.service';

const findUniqueMock = vi.fn();
vi.mock('@comicai/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

describe('AuthService (이메일 가입 및 인증)', () => {
  let createUserMock: ReturnType<typeof vi.fn>;
  let users: UsersService;
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    createUserMock = vi.fn();
    users = { createUser: createUserMock } as unknown as UsersService;
    service = new AuthService(users);
  });

  describe('signup', () => {
    it('신규 이메일로 가입 시 UsersService.createUser 를 호출하고 사용자 정보를 반환한다', async () => {
      findUniqueMock.mockResolvedValue(null);
      createUserMock.mockResolvedValue({
        id: 'user_new_1',
        email: 'new@example.com',
      });

      const res = await service.signup('new@example.com', 'password123!');

      expect(findUniqueMock).toHaveBeenCalledWith({ where: { email: 'new@example.com' } });
      expect(createUserMock).toHaveBeenCalledTimes(1);
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          passwordHash: expect.any(String),
        }),
      );
      expect(res).toEqual({ id: 'user_new_1', email: 'new@example.com' });
    });

    it('이미 존재하는 이메일이면 EMAIL_TAKEN 예외를 던지고 createUser 를 부르지 않는다', async () => {
      findUniqueMock.mockResolvedValue({ id: 'existing_id', email: 'taken@example.com' });

      await expect(service.signup('taken@example.com', 'pwd')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it('동시 요청으로 인한 P2002 충돌 시 EMAIL_TAKEN 예외로 변환한다', async () => {
      findUniqueMock.mockResolvedValue(null);
      const p2002Err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      createUserMock.mockRejectedValue(p2002Err);

      await expect(service.signup('race@example.com', 'pwd')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('verify', () => {
    it('올바른 비밀번호이면 사용자 정보를 반환한다', async () => {
      const hash = await argon2.hash('correct_pwd', { type: argon2.argon2id });
      findUniqueMock.mockResolvedValue({
        id: 'user_ok',
        email: 'user@example.com',
        passwordHash: hash,
      });

      const res = await service.verify('user@example.com', 'correct_pwd');
      expect(res).toEqual({ id: 'user_ok', email: 'user@example.com' });
    });

    it('비밀번호가 틀리면 UnauthorizedException 을 던진다', async () => {
      const hash = await argon2.hash('correct_pwd', { type: argon2.argon2id });
      findUniqueMock.mockResolvedValue({
        id: 'user_ok',
        email: 'user@example.com',
        passwordHash: hash,
      });

      await expect(service.verify('user@example.com', 'wrong_pwd')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('사용자가 없거나 해시가 없으면 UnauthorizedException 을 던진다', async () => {
      findUniqueMock.mockResolvedValue(null);
      await expect(service.verify('none@example.com', 'any')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
