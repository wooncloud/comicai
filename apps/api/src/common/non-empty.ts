/**
 * 빈 문자열을 "설정 안 됨" 으로 읽는다.
 *
 * compose 의 `${COOKIE_DOMAIN:-}` 는 변수를 **지우는 게 아니라 빈 문자열로 만든다.**
 * 그래서 이 코드베이스는 곳곳에서 `process.env.X || undefined` 를 쓰는데, lint 는 그걸
 * `??` 로 바꾸라고 한다(`prefer-nullish-coalescing`). 그대로 따르면 `COOKIE_DOMAIN=''`
 * 인 환경에서 쿠키에 `domain: ''` 이 실려 **로그아웃이 쿠키를 못 지운다.**
 *
 * `req.ip` 나 `user-agent` 도 같다 — 빈 값을 세션 메타에 그대로 넣으면 "어디서
 * 로그인했는지" 화면에 빈 줄이 남는다.
 *
 * 의도를 이름으로 박아 두면 `--fix` 도 사람도 그 자리를 `??` 로 바꾸지 않는다.
 * 트림은 하지 않는다 — 필요한 호출부가 이미 `?.trim()` 을 걸고 넘긴다.
 */
export function nonEmpty(value: string | null | undefined): string | undefined {
  return value == null || value === '' ? undefined : value;
}
