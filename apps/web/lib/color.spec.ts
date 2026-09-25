import { describe, expect, it } from 'vitest';
import { hexToHsv, hexToRgb, hsvToHex, isNearWhite, normalizeHex, rgbToHex } from './color';

describe('normalizeHex', () => {
  it('짧은 표기와 알파를 여섯 자리로 정리한다', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('112233')).toBe('#112233');
    expect(normalizeHex('#11223344')).toBe('#112233');
    expect(normalizeHex('  #FFFFFF  ')).toBe('#ffffff');
  });

  it('색이 아니면 null', () => {
    expect(normalizeHex('빨강')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('hex ↔ hsv', () => {
  // 고르개는 hex → hsv → (손으로 조작) → hex 로 돈다. 손대지 않았는데 값이
  // 달라지면, 색칸을 열었다 닫기만 해도 색이 바뀐 것으로 저장된다.
  it.each(['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#3b5bdb', '#f76f53', '#7f7f7f'])(
    '%s 는 왕복해도 그대로다',
    (hex) => {
      expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    },
  );

  it('무채색의 색상은 0 이다', () => {
    expect(hexToHsv('#808080')!.s).toBe(0);
    expect(hexToHsv('#808080')!.h).toBe(0);
  });
});

describe('rgbToHex', () => {
  it('범위를 벗어난 값은 잘라 낸다', () => {
    expect(rgbToHex({ r: -5, g: 300, b: 127.6 })).toBe('#00ff80');
  });
});

describe('isNearWhite', () => {
  it('흰 배경에서 사라질 색만 참', () => {
    expect(isNearWhite('#ffffff')).toBe(true);
    expect(isNearWhite('#f5f5f5')).toBe(true);
    expect(isNearWhite('#c8c8c8')).toBe(false);
    expect(isNearWhite('#000000')).toBe(false);
  });
});

describe('hexToRgb', () => {
  it('세 자리도 읽는다', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });
});
