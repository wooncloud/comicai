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
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { StorageService } from '../storage/storage.service';
import { MAX_UPLOAD_BYTES } from '../storage/image-validator';
import { requireUploadedFile } from '../common/upload';

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  avatarStorageKey: true,
  oauthProviders: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarStorageKey: string | null;
  oauthProviders: unknown;
};

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
  constructor(
    private readonly sessions: SessionService,
    private readonly storage: StorageService,
  ) {}

  private async toSessionUser(u: UserRow): Promise<SessionUser> {
    // avatarStorageKey가 있으면 presigned URL이 우선. 외부 avatarUrl은 폴백.
    let avatarUrl = u.avatarUrl;
    if (u.avatarStorageKey) {
      avatarUrl = (await this.storage.presignDownload(u.avatarStorageKey)).url;
    }
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl,
      oauthProviders: (u.oauthProviders as ('google' | 'github')[]) ?? [],
    };
  }

  @Get()
  async me(@Req() req: AuthedRequest): Promise<SessionUser> {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: USER_SELECT,
    });
    return this.toSessionUser(u);
  }

  @Patch()
  async patch(@Req() req: AuthedRequest, @Body() body: MePatchDto): Promise<SessionUser> {
    // PATCH로 외부 URL을 명시적으로 세팅/해제하면 업로드 키는 비운다.
    const clearStorageKey = body.avatarUrl !== undefined;
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        ...(clearStorageKey ? { avatarStorageKey: null } : {}),
      },
      select: USER_SELECT,
    });
    return this.toSessionUser(u);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadAvatar(
    @Req() req: AuthedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<SessionUser> {
    const f = requireUploadedFile(file);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'user-avatar', userId: req.user.id },
      f.buffer,
    );
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarStorageKey: ref.storageKey, avatarUrl: null },
      select: USER_SELECT,
    });
    return this.toSessionUser(u);
  }

  @Delete('avatar')
  @HttpCode(200)
  async deleteAvatar(@Req() req: AuthedRequest): Promise<SessionUser> {
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarStorageKey: null, avatarUrl: null },
      select: USER_SELECT,
    });
    return this.toSessionUser(u);
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
    const owns = await this.sessions.belongsTo(req.user.id, sid);
    if (!owns) throw new NotFoundException({ code: 'SESSION_NOT_FOUND' });
    await this.sessions.destroy(sid);
  }
}
