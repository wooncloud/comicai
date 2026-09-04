import { Controller, Get, Header, Param, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OAUTH_PROVIDERS, type OAuthProvider } from '@comicai/types';
import { OAuthService } from './oauth.service';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SessionService,
} from '../session.service';
import { sessionMetaFromRequest } from '../session.helpers';
import { issueCsrfToken } from '../../common/csrf.middleware';

@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 켜져 있는 소셜 로그인 목록. 웹은 이 목록에 있는 버튼만 그린다.
   *
   * `:provider` 보다 위에 있어야 한다. 아래에 두면 'providers' 가 provider 이름으로
   * 잡혀 라우트가 가려진다.
   */
  @Get('providers')
  // 배포 중에는 바뀌지 않는 값이다. 캐시하지 않으면 익명 방문자의 로그인 화면
  // 하드 로드마다 origin 을 치고, 요청마다 로그 한 줄과 throttler 카운터를 쓴다.
  @Header('Cache-Control', 'public, max-age=600')
  providers(): { providers: OAuthProvider[] } {
    return { providers: OAUTH_PROVIDERS.filter((p) => this.oauth.enabled(p)) };
  }

  @Get(':provider')
  async redirect(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const p = ensureSupported(provider);
    const { url, state } = await this.oauth.startAuth(p, returnTo);
    // 콜백이 "이 브라우저가 시작한 것" 임을 증명할 쿠키. sameSite=lax 여야 한다 —
    // strict 면 제공자에서 돌아오는 top-level 이동에 쿠키가 실리지 않아 항상 실패한다.
    res.cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTIONS);
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
      const result = await this.oauth.completeAuth(
        p,
        code,
        state,
        req.cookies?.[OAUTH_STATE_COOKIE],
      );
      res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_OPTIONS);
      const sid = await this.sessions.create(
        { userId: result.userId, email: result.email },
        sessionMetaFromRequest(req),
      );
      res.cookie(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
      issueCsrfToken(res, SESSION_COOKIE_OPTIONS.secure);
      const dest = result.returnTo && safeReturnTo(result.returnTo) ? result.returnTo : '/projects';
      res.redirect(302, `${webOrigin}${dest}`);
    } catch (err) {
      res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_OPTIONS);
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
