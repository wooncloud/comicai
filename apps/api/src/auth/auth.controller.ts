import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CredentialsSchema } from '@comicai/types';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SessionService } from './session.service';
import { CSRF_COOKIE, issueCsrfToken } from '../common/csrf.middleware';

class CredentialsDto {
  static zodSchema = CredentialsSchema;
  email!: string;
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('signup')
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @HttpCode(201)
  async signup(@Body() body: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.signup(body.email, body.password);
    const sid = await this.sessions.create({ userId: user.id, email: user.email });
    res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
    issueCsrfToken(res, SESSION_COOKIE_OPTIONS.secure);
    return user;
  }

  @Post('login')
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  async login(@Body() body: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.verify(body.email, body.password);
    const sid = await this.sessions.create({ userId: user.id, email: user.email });
    res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
    issueCsrfToken(res, SESSION_COOKIE_OPTIONS.secure);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) await this.sessions.destroy(sid);
    res.clearCookie(SESSION_COOKIE, { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    res.clearCookie(CSRF_COOKIE, { path: '/', maxAge: 0 });
  }
}
