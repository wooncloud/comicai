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
    this.redis = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  enabled(provider: OAuthProvider): boolean {
    return this.providerConfig(provider) !== null;
  }

  async startAuth(provider: OAuthProvider, returnTo?: string): Promise<string> {
    const cfg = this.requireProvider(provider);
    const state = urlSafeToken();
    await this.redis.set(
      STATE_PREFIX + state,
      JSON.stringify({ provider, returnTo: returnTo ?? null }),
      'EX',
      STATE_TTL_SECONDS,
    );
    return ADAPTERS[provider].authorizationUrl({
      clientId: cfg.clientId,
      redirectUri: this.redirectUri(provider),
      state,
    });
  }

  async completeAuth(
    provider: OAuthProvider,
    code: string,
    state: string,
  ): Promise<{ userId: string; email: string; returnTo: string | null }> {
    const cfg = this.requireProvider(provider);
    const rawState = await this.redis.get(STATE_PREFIX + state);
    if (!rawState) throw new BadRequestException({ code: 'OAUTH_STATE_INVALID' });
    await this.redis.del(STATE_PREFIX + state);
    const parsed = JSON.parse(rawState) as { provider: OAuthProvider; returnTo: string | null };
    if (parsed.provider !== provider)
      throw new BadRequestException({ code: 'OAUTH_STATE_INVALID' });
    let profile: OAuthProfile;
    try {
      profile = await ADAPTERS[provider].exchangeAndFetch({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: this.redirectUri(provider),
        code,
      });
    } catch (err) {
      throw new BadRequestException({
        code: 'OAUTH_PROVIDER_ERROR',
        message: (err as Error).message,
      });
    }
    const user = await this.linkOrCreateUser(provider, profile);
    return { userId: user.id, email: user.email, returnTo: parsed.returnTo };
  }

  private requireProvider(provider: OAuthProvider): ProviderConfig {
    const cfg = this.providerConfig(provider);
    if (!cfg) {
      throw new ServiceUnavailableException({
        code: 'OAUTH_PROVIDER_DISABLED',
        message: `${provider} OAuth는 활성화되지 않았습니다.`,
      });
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
    const existing = await prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true, email: true, oauthProviders: true, emailVerifiedAt: true },
    });
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
            oauthProviders: Array.from(providers) as unknown as object,
            emailVerifiedAt: needsVerify ? new Date() : undefined,
          },
        });
      }
      return { id: existing.id, email: existing.email };
    }
    const created = await prisma.user.create({
      data: {
        id: newId('user'),
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        oauthProviders: [provider] as unknown as object,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
      },
      select: { id: true, email: true },
    });
    return created;
  }
}
