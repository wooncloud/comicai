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

  /**
   * 이 사용자의 미사용 재설정 토큰을 전부 무효화한다.
   *
   * 비밀번호가 바뀌면(스스로 변경했든 재설정으로 바뀌었든) 그 전에 발급된 링크는
   * 더 이상 유효하면 안 된다. 예전에는 그렇지 않아서, 메일함에 잠깐 접근한 사람이
   * 링크만 빼 두면 **피해자가 이상을 눈치채고 비밀번호를 바꾼 뒤에도** 남은 30분
   * 안에 다시 덮어쓸 수 있었다. 재설정을 여러 번 요청하면 그 토큰들이 전부 동시에
   * 유효했던 것도 같은 문제다.
   */
  async revokePasswordResets(userId: string): Promise<void> {
    await prisma.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  private async issue(kind: TokenKind, userId: string, ttlMs: number): Promise<string> {
    const token = urlSafeToken();
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + ttlMs);
    const data = { id: newId(kind === 'verify' ? 'evf' : 'prt'), userId, tokenHash, expiresAt };
    if (kind === 'verify') {
      await prisma.emailVerification.create({ data });
    } else {
      // 새 링크를 보내면 이전 링크는 죽는다. 동시에 여러 개가 살아 있을 이유가 없다.
      await this.revokePasswordResets(userId);
      await prisma.passwordReset.create({ data });
    }
    return token;
  }

  /**
   * 1회용 토큰을 소비한다.
   *
   * **`updateMany` 로 조건과 갱신을 한 문장에 담는다.** 예전에는 `findUnique` 로 읽고
   * `usedAt` 을 검사한 뒤 별도 `update` 를 했는데, 같은 토큰으로 두 요청을 동시에
   * 보내면 둘 다 검사를 통과했다 — "1회용" 이 애플리케이션 검사에만 의존했고 그
   * 검사와 갱신 사이에 창이 있었다. 갱신된 행 수가 1일 때만 성공으로 친다.
   */
  private async consume(kind: TokenKind, token: string): Promise<{ userId: string }> {
    const tokenHash = sha256Hex(token);
    const now = new Date();
    const where = { tokenHash, usedAt: null, expiresAt: { gt: now } };
    const data = { usedAt: now };

    // 델리게이트를 변수로 묶으면 Prisma 의 유니온 타입이 호출 불가라, 분기를 그대로 둔다.
    const claimed =
      kind === 'verify'
        ? await prisma.emailVerification.updateMany({ where, data })
        : await prisma.passwordReset.updateMany({ where, data });

    const select = { userId: true, expiresAt: true } as const;
    const row =
      kind === 'verify'
        ? await prisma.emailVerification.findUnique({ where: { tokenHash }, select })
        : await prisma.passwordReset.findUnique({ where: { tokenHash }, select });

    if (claimed.count !== 1) {
      /*
       * 만료와 그 밖(없음·이미 씀)을 구분하는 이유는 문구가 다르기 때문이다 —
       * 만료면 "다시 요청하세요" 가 실행 가능한 안내이고, 나머지는 그렇지 않다.
       */
      if (row && row.expiresAt < now) throw new BadRequestException({ code: 'TOKEN_EXPIRED' });
      throw new BadRequestException({ code: 'TOKEN_INVALID' });
    }
    if (!row) throw new BadRequestException({ code: 'TOKEN_INVALID' });
    return { userId: row.userId };
  }
}
