import { describe, expect, it } from 'vitest';
import { MODEL_TOKEN_COST, type ModelId, type TokenBalanceDTO } from '@comicai/types';
import { affordability, affordableText, formatKrw } from './tokens';

/** 단가가 1 이 아닌 모델 하나. 어느 모델인지는 이 테스트의 관심사가 아니다. */
const OPENAI = 'gpt-image-2.5-flare' satisfies ModelId;

/*
 * 모델 목록은 늘어난다. 픽스처에 id 를 손으로 적어 두면 모델이 하나 추가될 때마다
 * 이 파일이 컴파일 에러로 막는다 — 테스트가 검사하는 것은 단가 계산이지 목록이 아니다.
 * 그래서 전역 표에서 만든다.
 */
function costsFrom(override: Partial<Record<ModelId, number>> = {}): Record<ModelId, number> {
  return { ...MODEL_TOKEN_COST, ...override };
}
function affordableFrom(n: number, costs: Record<ModelId, number>): Record<ModelId, number | null> {
  return Object.fromEntries(
    (Object.keys(costs) as ModelId[]).map((m) => [
      m,
      costs[m] > 0 ? Math.floor(n / costs[m]) : null,
    ]),
  ) as Record<ModelId, number | null>;
}

/** 플랫폼 키로 도는 보통 사용자. 단가는 전역 표와 같다. */
const balance = (n: number): TokenBalanceDTO => {
  const costs = costsFrom();
  return { balance: n, costs, affordable: affordableFrom(n, costs) };
};

/** 자기 OpenAI 키를 넣은 사용자 — 그 모델은 토큰을 쓰지 않는다. */
const byokBalance = (n: number): TokenBalanceDTO => {
  const costs = costsFrom({ [OPENAI]: 0 });
  return { balance: n, costs, affordable: affordableFrom(n, costs) };
};

describe('affordability', () => {
  it('모자라면 short 다', () => {
    expect(affordability(balance(1), OPENAI)).toEqual({ cost: 4, short: true });
  });

  it('충분하면 short 가 아니다', () => {
    expect(affordability(balance(4), OPENAI).short).toBe(false);
  });

  /*
   * 서버는 자기 키를 알아보고 공짜로 처리하는데 화면만 전역 단가표를 읽으면, BYOK
   * 사용자가 잔액 0 일 때 "4토큰 필요 · 토큰이 모자랍니다" 를 본다. 쓰지도 않는 토큰을
   * 채우러 간다.
   */
  it('자기 키가 있는 모델은 잔액 0 이어도 모자라지 않다', () => {
    expect(affordability(byokBalance(0), OPENAI)).toEqual({ cost: 0, short: false });
  });

  it('잔액을 못 읽었으면 short 가 아니다', () => {
    // 여기서 short 로 접으면 **조회가 실패한 사용자의 생성 버튼이 잠긴다.**
    // 막는 것은 서버가 할 일이지 화면이 추측으로 할 일이 아니다.
    expect(affordability(undefined, OPENAI)).toEqual({ cost: 4, short: false });
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

describe('formatKrw', () => {
  it('원 단위 정수를 그대로 찍는다 — 나누거나 곱하지 않는다', () => {
    expect(formatKrw(10000)).toBe('10,000원');
    expect(formatKrw(0)).toBe('0원');
  });
});
