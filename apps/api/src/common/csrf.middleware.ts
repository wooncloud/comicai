import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { SESSION_COOKIE } from '../auth/session.service';

export const CSRF_COOKIE = 'comicai_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF 보호 (spec 08-security §CSRF).
 * - 인증된 mutating 요청(POST/PATCH/PUT/DELETE)에 X-CSRF-Token 헤더 = comicai_csrf 쿠키 필수.
 * - 세션 쿠키가 없으면 통과(SessionGuard에서 401 처리).
 * - SameSite=Lax 위에 깊이 방어.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) {
      ensureCsrfCookie(req, res);
      return next();
    }
    const hasSession = Boolean(req.cookies?.[SESSION_COOKIE]);
    if (!hasSession) return next(); // 인증되지 않은 요청은 가드에서 처리.

    const headerToken = req.headers[CSRF_HEADER];
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    if (
      typeof headerToken !== 'string' ||
      typeof cookieToken !== 'string' ||
      headerToken !== cookieToken
    ) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'CSRF 토큰이 유효하지 않습니다.',
      });
    }
    return next();
  }
}

export function issueCsrfToken(res: Response, secure: boolean): string {
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

function ensureCsrfCookie(req: Request, res: Response) {
  if (req.cookies?.[CSRF_COOKIE]) return;
  if (!req.cookies?.[SESSION_COOKIE]) return; // 세션 없으면 토큰도 의미 없음.
  const secure = (req as Request & { secure?: boolean }).secure ?? false;
  issueCsrfToken(res, secure);
}
