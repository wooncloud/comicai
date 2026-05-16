import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CredentialsSchema } from '@comicai/types';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SessionService } from './session.service';

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
  @HttpCode(201)
  async signup(@Body() body: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.signup(body.email, body.password);
    const sid = await this.sessions.create({ userId: user.id, email: user.email });
    res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.verify(body.email, body.password);
    const sid = await this.sessions.create({ userId: user.id, email: user.email });
    res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) await this.sessions.destroy(sid);
    res.clearCookie(SESSION_COOKIE, { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  }
}
