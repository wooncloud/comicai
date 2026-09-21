import { Injectable } from '@nestjs/common';
import { newId, prisma, type User } from '@comicai/db';
import { TokensService } from '../tokens/tokens.service';

export interface CreateUserInput {
  email: string;
  passwordHash?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  avatarStorageKey?: string | null;
  oauthProviders?: string[];
  emailVerifiedAt?: Date | null;
  termsAgreedAt?: Date | null;
}

/**
 * 사용자를 생성하고 가입 축하 토큰을 지급한다.
 *
 * **계정 생성과 가입 지급은 반드시 한 몸이어야 한다.**
 * 예전에는 이메일 가입(`auth.service.ts`)과 OAuth 가입(`oauth.service.ts`) 두 곳에서
 * `prisma.user.create` 와 `tokens.grantSignupBonus` 를 손으로 각각 호출했다.
 * 그러면 세 번째 가입 경로(초대, 관리자 생성 등)가 생겼을 때 토큰 지급을 빠뜨리기 쉽고,
 * 신규 가입자가 잔액 0으로 시작해 아무것도 할 수 없게 된다(render 잡의 finalize 누락과 같은 구조).
 *
 * 이 서비스는 "사용자를 만드는 유일한 길"이다.
 *
 * 약관 동의 시각(`termsAgreedAt`)은 계정 생성 지점에 기록된다. 나중에 채우면
 * "동의는 받았으나 기록이 없는" 계정이 생겨 재동의 대상을 가려낼 수 없다.
 * 별도 값이 주어지지 않으면 현재 시각(`new Date()`)으로 기록된다.
 */
@Injectable()
export class UsersService {
  constructor(private readonly tokens: TokensService) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const user = await prisma.user.create({
      data: {
        id: newId('user'),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash ?? null,
        displayName: input.displayName ?? null,
        avatarUrl: input.avatarUrl ?? null,
        avatarStorageKey: input.avatarStorageKey ?? null,
        oauthProviders: input.oauthProviders ?? [],
        emailVerifiedAt: input.emailVerifiedAt ?? null,
        termsAgreedAt: input.termsAgreedAt ?? new Date(),
      },
    });

    await this.tokens.grantSignupBonus(user.id);

    return user;
  }
}
