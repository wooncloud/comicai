import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ZodError, ZodIssueCode } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';

function mockHost() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as any;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('wraps generic HttpException into error envelope with default code', () => {
    const { host, res } = mockHost();
    filter.catch(new NotFoundException(), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'NOT_FOUND' }) }),
    );
  });

  it('preserves caller-supplied code from HttpException payload', () => {
    const { host, res } = mockHost();
    filter.catch(new UnauthorizedException({ code: 'INVALID_CREDENTIALS' }), host);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
    });
  });

  it('maps ZodError to VALIDATION_ERROR with issues detail', () => {
    const { host, res } = mockHost();
    const err = new ZodError([
      {
        code: ZodIssueCode.too_small,
        minimum: 10,
        type: 'string',
        inclusive: true,
        path: ['password'],
        message: '비번 짧음',
      },
    ]);
    filter.catch(err, host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: expect.objectContaining({ issues: expect.any(Array) }),
        }),
      }),
    );
  });

  it('returns INTERNAL_ERROR for unknown exceptions', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류' },
    });
  });

  it('keeps extra payload fields as details', () => {
    const { host, res } = mockHost();
    filter.catch(new ConflictException({ code: 'EMAIL_TAKEN', email: 'a@b.c' }), host);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'EMAIL_TAKEN',
        message: '이미 사용 중인 이메일입니다.',
        details: { email: 'a@b.c' },
      },
    });
  });

  it('handles string body in HttpException', () => {
    const { host, res } = mockHost();
    filter.catch(new ForbiddenException('forbidden message'), host);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'forbidden message' },
    });
  });

  it('handles BadRequestException with custom code', () => {
    const { host, res } = mockHost();
    filter.catch(new BadRequestException({ code: 'CUSTOM_BAD' }), host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'CUSTOM_BAD' }) }),
    );
  });

  it('handles HttpException with non-object/non-string response', () => {
    const { host, res } = mockHost();
    // Edge case: numeric body — shouldn't crash.
    const err = new HttpException(42 as unknown as string, 500);
    filter.catch(err, host);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
