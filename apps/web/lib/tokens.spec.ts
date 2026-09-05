import { describe, expect, it } from 'vitest';
import { MODEL_TOKEN_COST, TOKEN_LEDGER_KINDS, type TokenBalanceDTO } from '@comicai/types';
import { LEDGER_KIND_LABEL, affordability, affordableText, formatKrw } from './tokens';

const balance = (n: number): TokenBalanceDTO => ({
  balance: n,
  affordable: { 'gemini-3.1-flash-image-preview': n, 'gpt-image-2': Math.floor(n / 4), mock: null },
});

describe('affordability', () => {
  it('모자라면 short 다', () => {
    expect(affordability(balance(1), 'gpt-image-2')).toEqual({
      cost: 4,
      short: true,
      unknown: false,
    });
  });

  it('충분하면 short 가 아니다', () => {
    expect(affordability(balance(4), 'gpt-image-2').short).toBe(false);
  });

  it('잔액을 못 읽었으면 short 가 아니라 unknown 이다', () => {
    // 여기서 short 로 접으면 **조회가 실패한 사용자의 생성 버튼이 잠긴다.**
    // 막는 것은 서버가 할 일이지 화면이 추측으로 할 일이 아니다.
    expect(affordability(undefined, 'gpt-image-2')).toEqual({
      cost: 4,
      short: false,
      unknown: true,
    });
  });

  it('비용이 0 인 모델은 잔액 0 이어도 막지 않는다', () => {
    expect(MODEL_TOKEN_COST.mock).toBe(0);
    expect(affordability(balance(0), 'mock').short).toBe(false);
  });
});

describe('affordableText', () => {
  it('null 은 제한 없음, undefined 는 모름 — 둘 다 0장이 아니다', () => {
    expect(affordableText(null)).toBe('제한 없음');
    expect(affordableText(undefined)).toBe('—');
    expect(affordableText(0)).toBe('0장');
  });
});

describe('원장 문구', () => {
  it('종류가 늘면 여기서 빠진 것이 드러난다', () => {
    // `Record<TokenLedgerKind, string>` 이 컴파일 시점에 막지만, 값이 빈 문자열이면
    // 타입은 통과하고 화면만 비어 보인다.
    for (const kind of TOKEN_LEDGER_KINDS) {
      expect(LEDGER_KIND_LABEL[kind]).toBeTruthy();
    }
  });
});

describe('formatKrw', () => {
  it('원 단위 정수를 그대로 찍는다 — 나누거나 곱하지 않는다', () => {
    expect(formatKrw(10000)).toBe('10,000원');
    expect(formatKrw(0)).toBe('0원');
  });
});
