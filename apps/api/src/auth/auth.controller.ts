import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@comicai/db';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SessionService } from './session.service';
import { SessionGuard, AuthedRequest } from './session.guard';

const CredentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(10).max(200),
});

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
    const sid = await this.sessions.create({ userId: user.id });
    res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.verify(body.email, body.password);
    const sid = await this.sessions.create({ userId: user.id });
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

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthedRequest) {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true } });
    return u;
  }
}
