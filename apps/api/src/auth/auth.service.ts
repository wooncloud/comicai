import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { newId, prisma } from '@comicai/db';

@Injectable()
export class AuthService {
  async signup(email: string, password: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException({ code: 'EMAIL_TAKEN' });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    // 동의 시각을 계정 생성과 같은 트랜잭션에 남긴다. 나중에 채우면 "동의는 받았는데
    // 기록이 없는" 계정이 생길 수 있고, 그러면 재동의 대상을 가려낼 수 없다.
    const user = await prisma.user.create({
      data: { id: newId('user'), email, passwordHash, termsAgreedAt: new Date() },
    });
    return { id: user.id, email: user.email };
  }

  async verify(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    return { id: user.id, email: user.email };
  }
}
