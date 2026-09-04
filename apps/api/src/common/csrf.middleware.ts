import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@comicai/types';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../auth/session.service';
import { hexToken } from './tokens';
import { apiError } from './api-error';

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
      throw new ForbiddenException(
        apiError({
          code: 'CSRF_INVALID',
          message: 'CSRF 토큰이 유효하지 않습니다.',
        }),
      );
    }
    return next();
  }
}

/**
 * CSRF 쿠키 옵션. **발급과 삭제가 같은 값을 써야 한다.**
 *
 * 예전에는 로그아웃이 `{ path, maxAge: 0 }` 만 넘겨서, 운영처럼 `COOKIE_DOMAIN`
 * 이 설정된 환경에서는 브라우저가 다른 쿠키로 보고 지우지 않았다 — 공용 PC 에서
 * 로그아웃해도 이전 사용자의 토큰이 남았다.
 */
export function csrfCookieOptions(secure: boolean) {
  const domain = process.env.COOKIE_DOMAIN || undefined;
  return {
    // 웹 JS 가 읽어 헤더로 되돌려 보내야 하므로 httpOnly 가 아니다(이중 제출 패턴).
    httpOnly: false,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

export function issueCsrfToken(res: Response, secure: boolean): string {
  const token = hexToken();
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions(secure));
  return token;
}
