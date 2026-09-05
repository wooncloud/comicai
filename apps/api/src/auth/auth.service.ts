import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { newId, prisma } from '@comicai/db';
import { apiError } from '../common/api-error';
import { TokensService } from '../tokens/tokens.service';

@Injectable()
export class AuthService {
  constructor(private readonly tokens: TokensService) {}

  async signup(email: string, password: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException(apiError({ code: 'EMAIL_TAKEN' }));
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    // 동의 시각을 계정 생성과 같은 트랜잭션에 남긴다. 나중에 채우면 "동의는 받았는데
    // 기록이 없는" 계정이 생길 수 있고, 그러면 재동의 대상을 가려낼 수 없다.
    /*
     * 위 존재 검사와 여기 사이에 창이 있다. 같은 이메일로 두 요청이 거의 동시에
     * 오면 둘 다 검사를 통과하고, 늦은 쪽이 unique 위반(P2002)을 맞는다. 그건
     * HttpException 이 아니라 500 으로 나가서, 프론트가 EMAIL_TAKEN 분기를 못 타고
     * "서버 오류" 를 띄웠다 — 더블클릭만으로도 재현된다.
     */
    try {
      const user = await prisma.user.create({
        data: { id: newId('user'), email, passwordHash, termsAgreedAt: new Date() },
      });
      // 계정을 만드는 곳이 여기와 OAuth 두 군데다. **양쪽 다** 지급해야 한다 —
      // 한쪽만 붙이면 그 경로로 가입한 사람은 잔액 0 으로 시작해 아무것도 못 한다.
      // 키가 `signup:{userId}` 라 두 번 불려도 한 번만 나간다.
      await this.tokens.grantSignupBonus(user.id);
      return { id: user.id, email: user.email };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(apiError({ code: 'EMAIL_TAKEN' }));
      }
      throw err;
    }
  }

  async verify(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash)
      throw new UnauthorizedException(apiError({ code: 'INVALID_CREDENTIALS' }));
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException(apiError({ code: 'INVALID_CREDENTIALS' }));
    return { id: user.id, email: user.email };
  }
}
