import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { prisma } from '@comicai/db';
import {
  CredentialsSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
} from '@comicai/types';
import { AuthService } from './auth.service';
import { AuthTokensService } from './auth-tokens.service';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SessionService } from './session.service';
import { sessionMetaFromRequest } from './session.helpers';
import { CSRF_COOKIE, issueCsrfToken } from '../common/csrf.middleware';
import { EmailService } from '../email/email.provider';

class CredentialsDto {
  static zodSchema = CredentialsSchema;
  email!: string;
  password!: string;
}

class PasswordResetRequestDto {
  static zodSchema = PasswordResetRequestSchema;
  email!: string;
}

class PasswordResetConfirmDto {
  static zodSchema = PasswordResetConfirmSchema;
  token!: string;
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly tokens: AuthTokensService,
    private readonly email: EmailService,
  ) {}

  @Post('signup')
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @HttpCode(201)
  async signup(
    @Body() body: CredentialsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.signup(body.email, body.password);
    const sid = await this.sessions.create(
      { userId: user.id, email: user.email },
      sessionMetaFromRequest(req),
    );
    res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
    issueCsrfToken(res, SESSION_COOKIE_OPTIONS.secure);
    const token = await this.tokens.issueEmailVerification(user.id);
    await this.email.sendVerification(user.email, token);
    return user;
  }

  @Post('login')
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  async login(
    @Body() body: CredentialsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.verify(body.email, body.password);
    const sid = await this.sessions.create(
      { userId: user.id, email: user.email },
      sessionMetaFromRequest(req),
    );
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

  @Post('verify-email/request')
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @HttpCode(204)
  async requestEmailVerification(@Req() req: Request) {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) return; // 비로그인은 조용히 통과(레코나이즈드 패턴).
    const payload = await this.sessions.read(sid);
    if (!payload) return;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return;
    const token = await this.tokens.issueEmailVerification(payload.userId);
    await this.email.sendVerification(user.email, token);
  }

  @Post('verify-email/:token')
  @HttpCode(204)
  async verifyEmail(@Param('token') token: string) {
    const { userId } = await this.tokens.consumeEmailVerification(token);
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  @Post('password-reset/request')
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @HttpCode(204)
  async requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true, email: true },
    });
    if (!user) return; // 사용자 존재 여부 누설 금지.
    const token = await this.tokens.issuePasswordReset(user.id);
    await this.email.sendPasswordReset(user.email, token);
  }

  @Post('password-reset/confirm')
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @HttpCode(204)
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    const { userId } = await this.tokens.consumePasswordReset(body.token);
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // 비밀번호 변경 시 모든 활성 세션 종료.
    await this.sessions.destroyAllForUser(userId);
  }
}
