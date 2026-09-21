import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { prisma } from '@comicai/db';
import { apiError } from '../common/api-error';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService) {}

  async signup(email: string, password: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException(apiError({ code: 'EMAIL_TAKEN' }));
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    /*
     * 위 존재 검사와 여기 사이에 창이 있다. 같은 이메일로 두 요청이 거의 동시에
     * 오면 둘 다 검사를 통과하고, 늦은 쪽이 unique 위반(P2002)을 맞는다. 그건
     * HttpException 이 아니라 500 으로 나가서, 프론트가 EMAIL_TAKEN 분기를 못 타고
     * "서버 오류" 를 띄웠다 — 더블클릭만으로도 재현된다.
     */
    try {
      const user = await this.users.createUser({
        email,
        passwordHash,
        // 가입 폼이 약관 동의를 받아야 제출된다(SignupSchema). 그 시각을 여기서 남긴다.
        termsAgreedAt: new Date(),
      });
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
