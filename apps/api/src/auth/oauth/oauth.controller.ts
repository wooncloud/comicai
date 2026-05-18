import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OAUTH_PROVIDERS, type OAuthProvider } from '@comicai/types';
import { OAuthService } from './oauth.service';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SessionService } from '../session.service';
import { sessionMetaFromRequest } from '../session.helpers';
import { issueCsrfToken } from '../../common/csrf.middleware';

@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  @Get(':provider')
  async redirect(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const p = ensureSupported(provider);
    const url = await this.oauth.startAuth(p, returnTo);
    res.redirect(302, url);
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') errorParam: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const p = ensureSupported(provider);
    const webOrigin = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    if (errorParam) {
      res.redirect(302, `${webOrigin}/login?error=${encodeURIComponent(errorParam)}`);
      return;
    }
    if (!code || !state) {
      res.redirect(302, `${webOrigin}/login?error=oauth_missing_params`);
      return;
    }
    try {
      const result = await this.oauth.completeAuth(p, code, state);
      const sid = await this.sessions.create(
        { userId: result.userId, email: result.email },
        sessionMetaFromRequest(req),
      );
      res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
      issueCsrfToken(res, SESSION_COOKIE_OPTIONS.secure);
      const dest = result.returnTo && safeReturnTo(result.returnTo) ? result.returnTo : '/projects';
      res.redirect(302, `${webOrigin}${dest}`);
    } catch (err) {
      const errCode = (
        (err as { response?: { code?: string } }).response?.code ?? 'oauth_failed'
      ).toLowerCase();
      res.redirect(302, `${webOrigin}/login?error=${encodeURIComponent(errCode)}`);
    }
  }
}

function ensureSupported(provider: string): OAuthProvider {
  if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) {
    throw new Error('UNSUPPORTED_OAUTH_PROVIDER');
  }
  return provider as OAuthProvider;
}

function safeReturnTo(p: string): boolean {
  return p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\');
}
