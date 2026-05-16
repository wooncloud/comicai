import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE, SessionService } from './session.service';

export interface AuthedRequest extends Request {
  user: { id: string; email: string };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedRequest['user'] }>();
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) throw new UnauthorizedException({ code: 'NO_SESSION' });
    const payload = await this.sessions.read(sid);
    if (!payload) throw new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    req.user = { id: payload.userId, email: payload.email };
    return true;
  }
}
