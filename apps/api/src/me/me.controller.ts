import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { prisma } from '@comicai/db';
import { MePatchSchema, type SessionUser } from '@comicai/types';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

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

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
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
}
