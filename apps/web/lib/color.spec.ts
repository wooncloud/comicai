import { describe, expect, it } from 'vitest';
import { isNearWhite, normalizeHex } from './color';

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

describe('isNearWhite', () => {
  it('흰 배경에서 사라질 색만 참', () => {
    expect(isNearWhite('#ffffff')).toBe(true);
    expect(isNearWhite('#f5f5f5')).toBe(true);
    expect(isNearWhite('#c8c8c8')).toBe(false);
    expect(isNearWhite('#000000')).toBe(false);
  });
});
