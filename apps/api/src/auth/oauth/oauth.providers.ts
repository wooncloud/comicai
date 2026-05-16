import type { OAuthProvider } from '@comicai/types';

export interface OAuthProfile {
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface OAuthAdapter {
  authorizationUrl(opts: { clientId: string; redirectUri: string; state: string }): string;
  exchangeAndFetch(opts: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<OAuthProfile>;
}

class OAuthHttpError extends Error {
  constructor(
    public provider: OAuthProvider,
    public status: number,
    message: string,
  ) {
    super(`[${provider}] ${status} ${message}`);
  }
}

async function tokenFetch(
  provider: OAuthProvider,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OAuthHttpError(provider, res.status, body.slice(0, 500));
  }
  return res.json();
}

export const googleAdapter: OAuthAdapter = {
  authorizationUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
  async exchangeAndFetch({ clientId, clientSecret, redirectUri, code }) {
    const tokenRes = (await tokenFetch('google', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
      }),
    })) as { access_token?: string };
    if (!tokenRes.access_token) throw new OAuthHttpError('google', 0, 'no access_token');
    const user = (await tokenFetch('google', 'https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${tokenRes.access_token}` },
    })) as {
      email?: string;
      verified_email?: boolean;
      name?: string;
      picture?: string;
    };
    if (!user.email) throw new OAuthHttpError('google', 0, 'no email');
    return {
      email: user.email,
      emailVerified: user.verified_email === true,
      displayName: user.name ?? null,
      avatarUrl: user.picture ?? null,
    };
  },
};

export const githubAdapter: OAuthAdapter = {
  authorizationUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },
  async exchangeAndFetch({ clientId, clientSecret, redirectUri, code }) {
    const tokenRes = (await tokenFetch('github', 'https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })) as { access_token?: string };
    if (!tokenRes.access_token) throw new OAuthHttpError('github', 0, 'no access_token');
    const headers = {
      authorization: `Bearer ${tokenRes.access_token}`,
      accept: 'application/vnd.github+json',
    };
    const [user, emails] = await Promise.all([
      tokenFetch('github', 'https://api.github.com/user', { headers }) as Promise<{
        name?: string | null;
        avatar_url?: string;
        email?: string | null;
      }>,
      tokenFetch('github', 'https://api.github.com/user/emails', { headers }) as Promise<
        Array<{ email: string; primary: boolean; verified: boolean }>
      >,
    ]);
    const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    const email = primary?.email ?? user.email;
    if (!email) throw new OAuthHttpError('github', 0, 'no verified email');
    return {
      email,
      emailVerified: primary?.verified === true,
      displayName: user.name ?? null,
      avatarUrl: user.avatar_url ?? null,
    };
  },
};

export const ADAPTERS: Record<OAuthProvider, OAuthAdapter> = {
  google: googleAdapter,
  github: githubAdapter,
};
