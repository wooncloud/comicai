import { describe, expect, it, vi, afterEach } from 'vitest';

/**
 * 쿠키 Secure 판정은 틀려도 아무 에러가 나지 않는다 — 그냥 평문으로 나갈 뿐이라
 * 배포한 뒤에 알아채기 어렵다. 그래서 경계를 테스트로 고정한다.
 *
 * 실제로 겪은 사고: compose 가 `COOKIE_SECURE: ${COOKIE_SECURE:-0}` 으로 항상 '0' 을
 * 넘겨서, 코드의 "프로덕션이면 자동 켜기" 판정이 조용히 덮였다. 빈 문자열로 바꿔도
 * `!= null` 검사는 통과하므로 같은 문제가 남는다.
 */
async function secureFor(env: { COOKIE_SECURE?: string; NODE_ENV?: string }) {
  vi.resetModules();
  const prev = { ...process.env };
  if (env.COOKIE_SECURE === undefined) delete process.env.COOKIE_SECURE;
  else process.env.COOKIE_SECURE = env.COOKIE_SECURE;
  process.env.NODE_ENV = env.NODE_ENV ?? 'test';
  try {
    const m = await import('./session.service');
    return m.SESSION_COOKIE_OPTIONS.secure;
  } finally {
    process.env = prev;
  }
}

afterEach(() => vi.resetModules());

describe('세션 쿠키 Secure 판정', () => {
  it('미설정 + production 이면 켜진다', async () => {
    expect(await secureFor({ NODE_ENV: 'production' })).toBe(true);
  });

  it.each([[''], ['   ']])('빈 값(%s)은 미설정으로 본다 — production 이면 켜진다', async (raw) => {
    // compose 의 `${COOKIE_SECURE:-}` 가 넘기는 값이다. 여기서 '설정됨 + 거짓' 으로
    // 읽으면 프로덕션 쿠키에서 Secure 가 조용히 빠진다.
    expect(await secureFor({ COOKIE_SECURE: raw, NODE_ENV: 'production' })).toBe(true);
  });

  it('미설정 + 비프로덕션이면 꺼진다', async () => {
    expect(await secureFor({ NODE_ENV: 'development' })).toBe(false);
  });

  it.each([['1'], ['true'], ['TRUE']])('%s 는 명시적으로 켠다', async (raw) => {
    expect(await secureFor({ COOKIE_SECURE: raw, NODE_ENV: 'development' })).toBe(true);
  });

  it.each([['0'], ['false']])('%s 는 production 이어도 명시적으로 끈다', async (raw) => {
    // https 아닌 곳에서 테스트할 때 필요한 탈출구다.
    expect(await secureFor({ COOKIE_SECURE: raw, NODE_ENV: 'production' })).toBe(false);
  });
});
