import { BadRequestException, Injectable } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import { sha256Hex, urlSafeToken } from '../common/tokens';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

type TokenKind = 'verify' | 'reset';

@Injectable()
export class AuthTokensService {
  async issueEmailVerification(userId: string): Promise<string> {
    return this.issue('verify', userId, VERIFY_TTL_MS);
  }

  async issuePasswordReset(userId: string): Promise<string> {
    return this.issue('reset', userId, RESET_TTL_MS);
  }

  async consumeEmailVerification(token: string): Promise<{ userId: string }> {
    return this.consume('verify', token);
  }

  async consumePasswordReset(token: string): Promise<{ userId: string }> {
    return this.consume('reset', token);
  }

  private async issue(kind: TokenKind, userId: string, ttlMs: number): Promise<string> {
    const token = urlSafeToken();
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + ttlMs);
    const data = { id: newId(kind === 'verify' ? 'evf' : 'prt'), userId, tokenHash, expiresAt };
    if (kind === 'verify') {
      await prisma.emailVerification.create({ data });
    } else {
      await prisma.passwordReset.create({ data });
    }
    return token;
  }

  private async consume(kind: TokenKind, token: string): Promise<{ userId: string }> {
    const tokenHash = sha256Hex(token);
    const row =
      kind === 'verify'
        ? await prisma.emailVerification.findUnique({ where: { tokenHash } })
        : await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!row) throw new BadRequestException({ code: 'TOKEN_INVALID' });
    if (row.usedAt) throw new BadRequestException({ code: 'TOKEN_INVALID' });
    if (row.expiresAt < new Date()) throw new BadRequestException({ code: 'TOKEN_EXPIRED' });
    if (kind === 'verify') {
      await prisma.emailVerification.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
    } else {
      await prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    }
    return { userId: row.userId };
  }
}
