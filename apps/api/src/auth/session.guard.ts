import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_COOKIE, SessionService } from './session.service';

export interface AuthedRequest extends Request {
  user: { id: string; email: string };
  sid: string;
}

/**
 * **전역 가드다**(`app.module.ts` 의 `APP_GUARD`). 기본값이 "로그인 필요" 이고,
 * 공개 경로만 `@Public()` 로 뚫는다 — 이유는 `public.decorator.ts`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthedRequest['user']; sid?: string }>();
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) throw new UnauthorizedException({ code: 'NO_SESSION' });
    const payload = await this.sessions.read(sid);
    if (!payload) throw new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    req.user = { id: payload.userId, email: payload.email };
    req.sid = sid;
    return true;
  }
}
