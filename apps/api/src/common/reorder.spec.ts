import { describe, expect, it } from 'vitest';
import { isReorderPermutation } from './reorder';

/**
 * 네 곳(pages / speech-bubbles / page-texts / page-lines)이 각자 "길이가 같은가 +
 * 전부 이 페이지 소속인가" 만 봤다. 그건 집합 비교라 중복이 통과한다. 통과하면 두 항목이
 * 같은 order 를 갖게 되고, 이후 orderBy 의 타이브레이크가 요청마다 달라져 순서가 흔들린다.
 */
const existing = new Set(['a', 'b', 'c']);

describe('재정렬 id 검증', () => {
  it('순열이면 통과', () => {
    expect(isReorderPermutation(['c', 'a', 'b'], existing)).toBe(true);
    expect(isReorderPermutation(['a', 'b', 'c'], existing)).toBe(true);
  });

  it('중복은 거부 — 길이·소속 검사만으로는 통과하던 입력이다', () => {
    expect(isReorderPermutation(['a', 'a', 'b'], existing)).toBe(false);
    expect(isReorderPermutation(['a', 'a', 'a'], existing)).toBe(false);
  });

  it('누락·초과·외부 id 는 거부', () => {
    expect(isReorderPermutation(['a', 'b'], existing)).toBe(false);
    expect(isReorderPermutation(['a', 'b', 'c', 'd'], existing)).toBe(false);
    expect(isReorderPermutation(['a', 'b', 'z'], existing)).toBe(false);
  });

  it('빈 집합은 빈 목록만 통과', () => {
    expect(isReorderPermutation([], new Set())).toBe(true);
    expect(isReorderPermutation(['a'], new Set())).toBe(false);
  });
});
