import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  csrfFromCookies,
  startIntegration,
  stopIntegration,
  type IntegrationContext,
} from './setup';

describe('Auth integration (testcontainers)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await startIntegration();
  });

  afterAll(async () => {
    if (ctx) await stopIntegration(ctx);
  });

  it('signup → me → logout 라이프사이클', async () => {
    const server = ctx.app.getHttpServer();
    const email = `int-${Date.now()}@example.com`;
    const password = 'Pa55word!ok';

    // SignupSchema 의 agreeToTerms 는 z.literal(true) 다 — 빠지면 400 이다.
    const signup = await request(server)
      .post('/v1/auth/signup')
      .send({ email, password, agreeToTerms: true })
      .expect(201);

    expect(signup.body.data.email).toBe(email);
    /*
     * supertest 의 헤더 타입은 `string | string[] | undefined` 인데 `.set('Cookie', …)`
     * 는 undefined 를 받지 않는다. 여기서 단언하고 좁힌다 — 없으면 그게 실패다.
     */
    const cookies = signup.headers['set-cookie'] as string[] | undefined;
    if (!cookies) throw new Error('signup 이 세션 쿠키를 내려주지 않았습니다.');
    const csrf = csrfFromCookies(cookies);
    expect(csrf).toBeDefined();

    const me = await request(server).get('/v1/me').set('Cookie', cookies).expect(200);
    expect(me.body.data.email).toBe(email);

    await request(server)
      .post('/v1/auth/logout')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf!)
      .expect(204);

    await request(server).get('/v1/me').set('Cookie', cookies).expect(401);
  });

  it('잘못된 비밀번호로 로그인 실패', async () => {
    const server = ctx.app.getHttpServer();
    const email = `int2-${Date.now()}@example.com`;

    await request(server)
      .post('/v1/auth/signup')
      .send({ email, password: 'Pa55word!ok', agreeToTerms: true })
      .expect(201);

    const res = await request(server)
      .post('/v1/auth/login')
      .send({ email, password: 'wrongPwd9!!' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
