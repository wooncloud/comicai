import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@comicai/types';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../auth/session.service';
import { hexToken } from './tokens';

export const CSRF_COOKIE = CSRF_COOKIE_NAME;
const SKIP_PATHS = new Set(['/healthz', '/metrics']);
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
    if (SKIP_PATHS.has(req.path)) return next();
    const sessionCookie = req.cookies?.[SESSION_COOKIE];
    if (SAFE_METHODS.has(req.method)) {
      if (sessionCookie && !req.cookies?.[CSRF_COOKIE]) {
        issueCsrfToken(res, SESSION_COOKIE_OPTIONS.secure);
      }
      return next();
    }
    if (!sessionCookie) return next(); // 인증되지 않은 요청은 가드에서 처리.

    const headerToken = req.headers[CSRF_HEADER_NAME];
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
  const token = hexToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  return token;
}
