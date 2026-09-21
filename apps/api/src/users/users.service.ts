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
  /**
   * 약관 동의 시각. **기본값이 없다 — 호출하는 쪽이 반드시 정한다.**
   *
   * `?? new Date()` 로 채우면, 동의 절차 없이 만들어지는 계정(관리자 생성, 초대 등)에도
   * 동의 기록이 생긴다. 그건 "기록 누락" 보다 나쁘다 — 받은 적 없는 동의를 받았다고 적는 것이다.
   * 동의를 받지 않은 경로는 `null` 을 넘기고, 재동의 대상으로 걸러진다.
   */
  termsAgreedAt: Date | null;
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
 * 값은 호출하는 쪽이 정한다(`CreateUserInput.termsAgreedAt` 참고).
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
        termsAgreedAt: input.termsAgreedAt,
      },
    });

    await this.tokens.grantSignupBonus(user.id);

    return user;
  }
}
