import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import argon2 from 'argon2';
import { prisma } from '@comicai/db';
import {
  MePatchSchema,
  PasswordChangeSchema,
  type SessionInfo,
  type SessionUser,
} from '@comicai/types';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
import { SessionService } from '../auth/session.service';

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  oauthProviders: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  oauthProviders: unknown;
};

function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    oauthProviders: (u.oauthProviders as ('google' | 'github')[]) ?? [],
  };
}

class MePatchDto {
  static zodSchema = MePatchSchema;
  displayName?: string | null;
  avatarUrl?: string | null;
}

class PasswordChangeDto {
  static zodSchema = PasswordChangeSchema;
  currentPassword!: string;
  newPassword!: string;
}

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  async me(@Req() req: AuthedRequest): Promise<SessionUser> {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: USER_SELECT,
    });
    return toSessionUser(u);
  }

  @Patch()
  async patch(@Req() req: AuthedRequest, @Body() body: MePatchDto): Promise<SessionUser> {
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
      select: USER_SELECT,
    });
    return toSessionUser(u);
  }

  @Patch('password')
  @HttpCode(204)
  async changePassword(@Req() req: AuthedRequest, @Body() body: PasswordChangeDto): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: { passwordHash: true },
    });
    if (!user.passwordHash) {
      throw new BadRequestException({
        code: 'PASSWORD_REQUIRED',
        message: '비밀번호가 설정되지 않은 계정입니다.',
      });
    }
    const ok = await argon2.verify(user.passwordHash, body.currentPassword);
    if (!ok) throw new UnauthorizedException({ code: 'INVALID_PASSWORD' });
    const newHash = await argon2.hash(body.newPassword, { type: argon2.argon2id });
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: newHash } });
    await this.sessions.destroyAllExcept(req.user.id, req.sid);
  }

  @Get('sessions')
  async listSessions(@Req() req: AuthedRequest): Promise<SessionInfo[]> {
    const list = await this.sessions.listForUser(req.user.id);
    return list.map((s) => ({
      id: s.id,
      current: s.id === req.sid,
      ip: s.ip ?? null,
      userAgent: s.userAgent ?? null,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    }));
  }

  @Delete('sessions/:sid')
  @HttpCode(204)
  async revokeSession(@Req() req: AuthedRequest, @Param('sid') sid: string): Promise<void> {
    const list = await this.sessions.listForUser(req.user.id);
    const found = list.find((s) => s.id === sid);
    if (!found) throw new NotFoundException({ code: 'SESSION_NOT_FOUND' });
    await this.sessions.destroy(sid);
  }
}
