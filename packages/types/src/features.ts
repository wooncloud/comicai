/**
 * 기능 플래그와 관리자 판정.
 *
 * 서버(apps/api)와 웹(apps/web)이 **같은 해석 규칙**을 쓰도록 여기 모았다.
 * 한쪽은 `'true'`, 다른 쪽은 `'1'` 을 참으로 읽는 식으로 갈리면, 화면은 숨겨졌는데
 * API 는 열려 있거나 그 반대인 상태가 조용히 만들어진다.
 */

/** `'1'` 또는 `'true'` 만 켜짐으로 본다. 빈 값·미설정은 꺼짐. */
export function isFlagOn(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * 기본이 **켜짐**인 플래그. 값이 없으면 켜짐이고, 명시적으로 껐을 때만 꺼진다.
 *
 * `isFlagOn` 을 그대로 쓰면 미설정이 꺼짐이 되어 기본값이 뒤집힌다. 그래서 이런 플래그는
 * 호출부마다 `!== '0'` 같은 식으로 손으로 읽고 있었는데, 그러면 `'false'`·`'off'` 가
 * **켜짐으로 읽힌다** — 끄려던 사람이 못 끈다.
 */
export function isFlagOnByDefault(raw: string | undefined | null): boolean {
  return raw == null || raw.trim() === '' ? true : isFlagOn(raw);
}

/**
 * 관리자 이메일 허용 목록을 파싱한다.
 *
 * 값은 반드시 환경변수(`ADMIN_EMAILS`)로만 받는다 — 저장소가 공개라서 코드에 적으면
 * 개인 이메일이 그대로 공개된다.
 *
 * 쉼표로 구분하고, 앞뒤 공백과 대소문자를 정규화한다. 이메일 로컬파트는 원칙적으로
 * 대소문자를 구분하지만 실무의 모든 제공자가 구분하지 않고, 여기서 구분하면
 * 대문자로 가입한 관리자가 조용히 막힌다.
 */
export function parseAdminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 관리자인가.
 *
 * 목록이 비어 있으면 **아무도 관리자가 아니다**. 설정을 깜빡했을 때 전원이
 * 관리자가 되는 것보다 아무도 못 들어가는 쪽이 안전하다.
 */
export function isAdminEmail(email: string, adminEmails: readonly string[]): boolean {
  if (adminEmails.length === 0) return false;
  return adminEmails.includes(email.trim().toLowerCase());
}
