import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { SessionGuard } from './session.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_COOKIE, type SessionService } from './session.service';

/**
 * 이 가드는 **전역**이라 기본값이 "로그인 필요" 다. 예전에는 컨트롤러마다 붙이는 방식이라,
 * 가드를 잊은 새 컨트롤러가 인증도 CSRF 도 없는 상태가 됐다 — `CsrfMiddleware` 가
 * "세션 쿠키 없는 요청" 을 통과시키기 때문이다(가드가 401 로 막아 줄 것을 전제한다).
 *
 * 여기서 고정하는 것: 표시가 없으면 잠긴다, `@Public()` 만 열린다.
 */
function ctx(cookies: Record<string, string> = {}, isPublic = false) {
  const req: Record<string, unknown> = { cookies };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => (isPublic ? handlerPublic : handlerPlain),
      getClass: () => classPlain,
    } as never,
  };
}

function handlerPublic() {}
function handlerPlain() {}
function classPlain() {}
Reflect.defineMetadata(IS_PUBLIC_KEY, true, handlerPublic);

function guard(read: SessionService['read'] = () => Promise.resolve(null)) {
  return new SessionGuard({ read } as SessionService, new Reflector());
}

describe('SessionGuard', () => {
  it('표시가 없고 세션 쿠키도 없으면 막는다 — 이게 기본값이다', async () => {
    const { ctx: c } = ctx();
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('세션 쿠키가 있어도 세션이 없으면 막는다', async () => {
    const { ctx: c } = ctx({ [SESSION_COOKIE]: 'dead-sid' });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('유효한 세션이면 통과하고 req.user 를 채운다', async () => {
    const read = vi.fn().mockResolvedValue({ userId: 'u1', email: 'a@b.co' });
    const { ctx: c, req } = ctx({ [SESSION_COOKIE]: 'good-sid' });
    await expect(guard(read).canActivate(c)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'u1', email: 'a@b.co' });
    expect(req.sid).toBe('good-sid');
  });

  it('@Public() 이 붙은 라우트는 세션 없이 통과한다', async () => {
    const read = vi.fn();
    const { ctx: c } = ctx({}, true);
    await expect(guard(read).canActivate(c)).resolves.toBe(true);
    // 공개 경로에서 세션을 읽으면 그것만으로 Redis 왕복이 생긴다.
    expect(read).not.toHaveBeenCalled();
  });
});
