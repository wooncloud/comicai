import { describe, expect, it } from 'vitest';
import { isFlagOnByDefault, isAdminEmail, isFlagOn, parseAdminEmails } from './features';

/**
 * 관리자 판정은 틀리면 남의 운영 화면이 열리거나 내가 못 들어가는 로직이라,
 * 경계 조건을 고정해 둔다.
 */

describe('isFlagOn', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['TRUE', true],
    ['  true  ', true],
  ])('%s 은 켜짐', (raw, expected) => {
    expect(isFlagOn(raw)).toBe(expected);
  });

  it.each([['0'], ['false'], [''], ['  '], ['yes'], ['on'], [undefined], [null]])(
    '%s 은 꺼짐',
    (raw) => {
      expect(isFlagOn(raw)).toBe(false);
    },
  );

  it('오타나 예상 못 한 값은 꺼짐으로 본다', () => {
    // 켜짐을 기본으로 두면 오타 하나로 아직 공개하지 않은 기능이 열린다.
    expect(isFlagOn('ture')).toBe(false);
    expect(isFlagOn('enabled')).toBe(false);
  });
});

describe('parseAdminEmails', () => {
  it('쉼표로 나누고 공백과 대소문자를 정규화한다', () => {
    expect(parseAdminEmails(' A@B.com , c@d.CO.kr ')).toEqual(['a@b.com', 'c@d.co.kr']);
  });

  it('빈 값과 미설정은 빈 목록', () => {
    expect(parseAdminEmails('')).toEqual([]);
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails(null)).toEqual([]);
  });

  it('빈 항목은 버린다 — 쉼표만 남은 값이 전원 통과로 이어지면 안 된다', () => {
    expect(parseAdminEmails(',,')).toEqual([]);
    expect(parseAdminEmails('a@b.com,,')).toEqual(['a@b.com']);
  });
});

describe('isAdminEmail', () => {
  const admins = parseAdminEmails('owner@example.com, second@example.com');

  it('목록에 있으면 참', () => {
    expect(isAdminEmail('owner@example.com', admins)).toBe(true);
    expect(isAdminEmail('second@example.com', admins)).toBe(true);
  });

  it('대소문자와 공백이 달라도 같은 사람으로 본다', () => {
    // 대문자로 가입한 관리자가 조용히 막히면 원인을 찾기 어렵다.
    expect(isAdminEmail('  Owner@Example.COM ', admins)).toBe(true);
  });

  it('목록에 없으면 거짓', () => {
    expect(isAdminEmail('someone@example.com', admins)).toBe(false);
  });

  it('부분 일치로 통과하지 않는다', () => {
    expect(isAdminEmail('owner@example.com.attacker.net', admins)).toBe(false);
    expect(isAdminEmail('owner@example.co', admins)).toBe(false);
    expect(isAdminEmail('notowner@example.com', admins)).toBe(false);
  });

  it('목록이 비어 있으면 아무도 관리자가 아니다', () => {
    // 설정을 깜빡했을 때 전원이 관리자가 되는 것보다 아무도 못 들어가는 쪽이 안전하다.
    expect(isAdminEmail('owner@example.com', [])).toBe(false);
    expect(isAdminEmail('', [])).toBe(false);
  });

  it('빈 이메일은 목록이 있어도 거짓', () => {
    expect(isAdminEmail('', admins)).toBe(false);
    expect(isAdminEmail('   ', admins)).toBe(false);
  });
});

/**
 * 기본이 켜짐인 플래그는 호출부마다 `!== '0'` 으로 읽고 있었다. 그러면 `'false'`·`'off'`
 * 가 켜짐으로 읽혀 **끄려던 사람이 못 끈다.** 규칙을 여기서 고정한다.
 */
describe('isFlagOnByDefault', () => {
  it('미설정·빈 값은 켜짐', () => {
    expect(isFlagOnByDefault(undefined)).toBe(true);
    expect(isFlagOnByDefault(null)).toBe(true);
    expect(isFlagOnByDefault('')).toBe(true);
    expect(isFlagOnByDefault('   ')).toBe(true);
  });

  it("'1'/'true' 는 켜짐", () => {
    expect(isFlagOnByDefault('1')).toBe(true);
    expect(isFlagOnByDefault('true')).toBe(true);
    expect(isFlagOnByDefault('TRUE')).toBe(true);
  });

  it('그 외 값은 꺼짐 — 0 만이 아니라 false·off 도 실제로 끈다', () => {
    expect(isFlagOnByDefault('0')).toBe(false);
    expect(isFlagOnByDefault('false')).toBe(false);
    expect(isFlagOnByDefault('off')).toBe(false);
  });
});
