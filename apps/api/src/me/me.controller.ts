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
import { AuthedRequest } from '../auth/session.guard';
import { isAdmin } from '../auth/admin.guard';
import { SessionService } from '../auth/session.service';
import { StorageService } from '../storage/storage.service';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { MAX_UPLOAD_BYTES } from '../storage/image-validator';
import { requireUploadedFile } from '../common/upload';
import { apiError } from '../common/api-error';
import { jsonColumn } from '../common/json-column';

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  avatarStorageKey: true,
  oauthProviders: true,
  // isAdmin 판정에 쓴다 — 인증하지 않은 계정은 운영자가 될 수 없다.
  emailVerifiedAt: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarStorageKey: string | null;
  oauthProviders: unknown;
  emailVerifiedAt: Date | null;
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
export class MeController {
  constructor(
    private readonly sessions: SessionService,
    private readonly storage: StorageService,
    private readonly tokens: AuthTokensService,
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
      oauthProviders: jsonColumn<('google' | 'github')[]>(u.oauthProviders) ?? [],
      // 서버에서만 계산한다. 클라이언트는 이 값을 화면 숨김에만 쓰고,
      // 실제 차단은 AdminGuard 가 한다.
      isAdmin: isAdmin(u.email, u.emailVerifiedAt),
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
    // 키를 비우면 그 오브젝트를 가리키는 것이 사라진다 — 업로드/삭제 경로와 같은 이유로
    // 실물도 함께 지운다.
    const orphaned = clearStorageKey ? await this.currentAvatarKey(req.user.id) : null;
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        ...(clearStorageKey ? { avatarStorageKey: null } : {}),
      },
      select: USER_SELECT,
    });
    if (orphaned) await this.storage.deleteKeys([orphaned]);
    return this.toSessionUser(u);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadAvatar(
    @Req() req: AuthedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<SessionUser> {
    const f = requireUploadedFile(file);
    const previous = await this.currentAvatarKey(req.user.id);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'user-avatar', userId: req.user.id },
      f.buffer,
    );
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarStorageKey: ref.storageKey, avatarUrl: null },
      select: USER_SELECT,
    });
    // 교체된 옛 아바타는 아무도 가리키지 않는다. 새 것을 올린 **뒤에** 지운다 —
    // 반대 순서면 업로드가 실패했을 때 멀쩡한 아바타가 사라진다.
    if (previous && previous !== ref.storageKey) await this.storage.deleteKeys([previous]);
    return this.toSessionUser(u);
  }

  @Delete('avatar')
  @HttpCode(200)
  async deleteAvatar(@Req() req: AuthedRequest): Promise<SessionUser> {
    const previous = await this.currentAvatarKey(req.user.id);
    const u = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarStorageKey: null, avatarUrl: null },
      select: USER_SELECT,
    });
    // 포인터만 끊으면 사용자는 "삭제했다" 고 믿는데 얼굴 사진은 버킷에 그대로 남는다.
    if (previous) await this.storage.deleteKeys([previous]);
    return this.toSessionUser(u);
  }

  /** 현재 업로드 아바타의 키. 외부 URL 만 쓰는 계정이면 null. */
  private async currentAvatarKey(userId: string): Promise<string | null> {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarStorageKey: true },
    });
    return row?.avatarStorageKey ?? null;
  }

  @Patch('password')
  @HttpCode(204)
  async changePassword(@Req() req: AuthedRequest, @Body() body: PasswordChangeDto): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: { passwordHash: true },
    });
    if (!user.passwordHash) {
      throw new BadRequestException(
        apiError({
          code: 'PASSWORD_REQUIRED',
          message: '비밀번호가 설정되지 않은 계정입니다.',
        }),
      );
    }
    const ok = await argon2.verify(user.passwordHash, body.currentPassword);
    if (!ok) throw new UnauthorizedException(apiError({ code: 'INVALID_PASSWORD' }));
    const newHash = await argon2.hash(body.newPassword, { type: argon2.argon2id });
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: newHash } });
    await this.sessions.destroyAllExcept(req.user.id, req.sid);
    /*
     * 아직 살아 있는 재설정 링크도 죽인다.
     *
     * 메일함에 잠깐 접근한 사람이 링크만 빼 두면, 피해자가 이상을 눈치채고 여기서
     * 비밀번호를 바꿔도 남은 30분 안에 다시 덮어쓸 수 있었다 — 그때는 재설정 쪽이
     * 모든 세션을 끊으므로 피해자가 완전히 밀려난다.
     */
    await this.tokens.revokePasswordResets(req.user.id);
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
    if (!owns) throw new NotFoundException(apiError({ code: 'SESSION_NOT_FOUND' }));
    await this.sessions.destroy(sid);
  }
}
