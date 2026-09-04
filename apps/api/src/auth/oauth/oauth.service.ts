import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { newId, prisma } from '@comicai/db';
import type { OAuthProvider } from '@comicai/types';
import { urlSafeToken } from '../../common/tokens';
import { ADAPTERS, type OAuthProfile } from './oauth.providers';
import { apiError } from '../../common/api-error';
import { redisUrl } from '../../common/env';

const STATE_TTL_SECONDS = 10 * 60;
const STATE_PREFIX = 'oauth_state:';

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
}

@Injectable()
export class OAuthService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(redisUrl(config));
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  enabled(provider: OAuthProvider): boolean {
    return this.providerConfig(provider) !== null;
  }

  /**
   * 인가 URL과 그 요청을 시작한 브라우저를 묶을 값을 함께 돌려준다.
   *
   * 컨트롤러가 `state` 를 쿠키로도 심어야 한다. Redis 에만 두면 "이 state 가
   * 발급된 적이 있는가" 만 확인하게 되는데, 그건 **누가** 시작했는지를 묻지 않는다.
   * 공격자가 자기 계정으로 동의까지 마친 뒤 콜백 URL 을 열지 않고 피해자에게
   * 보내면, 피해자 브라우저에 공격자 계정의 세션이 심긴다(로그인 CSRF).
   * 그 뒤 피해자가 만드는 작업물은 전부 공격자 계정에 쌓인다.
   */
  async startAuth(
    provider: OAuthProvider,
    returnTo?: string,
  ): Promise<{ url: string; state: string }> {
    const cfg = this.requireProvider(provider);
    const state = urlSafeToken();
    await this.redis.set(
      STATE_PREFIX + state,
      JSON.stringify({ provider, returnTo: returnTo ?? null }),
      'EX',
      STATE_TTL_SECONDS,
    );
    const url = ADAPTERS[provider].authorizationUrl({
      clientId: cfg.clientId,
      redirectUri: this.redirectUri(provider),
      state,
    });
    return { url, state };
  }

  async completeAuth(
    provider: OAuthProvider,
    code: string,
    state: string,
    cookieState: string | undefined,
  ): Promise<{ userId: string; email: string; returnTo: string | null }> {
    const cfg = this.requireProvider(provider);

    // 이 콜백을 시작한 브라우저가 맞는가. 쿠키는 이 브라우저에만 있으므로,
    // 남이 만든 콜백 URL 을 열어도 여기서 걸린다.
    if (!cookieState || cookieState !== state) {
      throw new BadRequestException(apiError({ code: 'OAUTH_STATE_INVALID' }));
    }

    const rawState = await this.redis.get(STATE_PREFIX + state);
    if (!rawState) throw new BadRequestException(apiError({ code: 'OAUTH_STATE_INVALID' }));
    await this.redis.del(STATE_PREFIX + state);
    const parsed = JSON.parse(rawState) as { provider: OAuthProvider; returnTo: string | null };
    if (parsed.provider !== provider)
      throw new BadRequestException(apiError({ code: 'OAUTH_STATE_INVALID' }));
    let profile: OAuthProfile;
    try {
      profile = await ADAPTERS[provider].exchangeAndFetch({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: this.redirectUri(provider),
        code,
      });
    } catch (err) {
      throw new BadRequestException(
        apiError({
          code: 'OAUTH_PROVIDER_ERROR',
          message: (err as Error).message,
        }),
      );
    }
    const user = await this.linkOrCreateUser(provider, profile);
    return { userId: user.id, email: user.email, returnTo: parsed.returnTo };
  }

  private requireProvider(provider: OAuthProvider): ProviderConfig {
    const cfg = this.providerConfig(provider);
    if (!cfg) {
      throw new ServiceUnavailableException(
        apiError({
          code: 'OAUTH_PROVIDER_DISABLED',
          message: `${provider} OAuth는 활성화되지 않았습니다.`,
        }),
      );
    }
    return cfg;
  }

  private providerConfig(provider: OAuthProvider): ProviderConfig | null {
    const prefix = provider.toUpperCase();
    const clientId = this.config.get<string>(`${prefix}_OAUTH_CLIENT_ID`);
    const clientSecret = this.config.get<string>(`${prefix}_OAUTH_CLIENT_SECRET`);
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }

  private redirectUri(provider: OAuthProvider): string {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.config.get<string>('API_PORT') ?? '4000'}`;
    return `${base}/v1/auth/oauth/${provider}/callback`;
  }

  private async linkOrCreateUser(
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<{ id: string; email: string }> {
    /*
     * 제공자가 준 이메일도 정규화한다. GitHub 처럼 대소문자를 섞어 주는 곳이 있어
     * 그대로 쓰면 같은 사람에게 계정이 두 벌 생긴다. 웹 폼 쪽은 Zod EmailSchema 가
     * 하지만 이 경로는 폼을 거치지 않는다.
     */
    const email = profile.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, oauthProviders: true, emailVerifiedAt: true },
    });

    /*
     * **제공자가 이메일 소유를 증명해 준 경우에만** 기존 계정에 붙인다.
     *
     * 예전에는 이메일이 같기만 하면 그 계정의 세션을 발급했다. 어떤 제공자에서
     * 남의 이메일을 소유 증명 없이 등록할 수 있으면, 그 계정으로 소셜 로그인해
     * 비밀번호를 모르는 채 남의 계정을 통째로 가져갈 수 있었다.
     *
     * 신규 생성은 막지 않는다 — 그 이메일로 된 계정이 아직 없으니 뺏을 것이 없고,
     * `emailVerifiedAt` 은 null 로 남아 인증 메일을 따로 받게 된다.
     */
    if (existing && !profile.emailVerified) {
      throw new BadRequestException(apiError({ code: 'OAUTH_EMAIL_UNVERIFIED' }));
    }

    if (existing) {
      const providers = new Set(
        ((existing.oauthProviders as OAuthProvider[]) ?? []).filter(Boolean),
      );
      const needsLink = !providers.has(provider);
      const needsVerify = !existing.emailVerifiedAt && profile.emailVerified;
      if (needsLink || needsVerify) {
        providers.add(provider);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            oauthProviders: Array.from(providers),
            emailVerifiedAt: needsVerify ? new Date() : undefined,
          },
        });
      }
      return { id: existing.id, email: existing.email };
    }
    /*
     * 계정을 만드는 두 경로 중 하나다(다른 하나는 AuthService.signup).
     * 동의 시각은 "가입 폼"이 아니라 **계정 생성** 에 붙어야 한다 — 한쪽에만
     * 붙이면 다른 경로로 만들어진 계정에 기록이 없고, 재동의 대상을 가려낼 수 없다.
     *
     * 소셜 가입에는 체크박스가 없다. 대신 웹의 OAuthButtons 가 버튼 아래에
     * "계속하면 이용약관·개인정보 처리방침에 동의하는 것으로 봅니다" 를 띄우고,
     * 그 문구가 여기 기록의 근거다. 문구를 지우면 이 줄도 근거를 잃는다.
     */
    const created = await prisma.user.create({
      data: {
        id: newId('user'),
        email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        oauthProviders: [provider],
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        termsAgreedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    return created;
  }
}
