import { describe, expect, it } from 'vitest';
import {
  defaultPageLineStyle,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
} from '@comicai/types';

/**
 * page-lines / page-texts / speech-bubbles 의 patch 는 style 을 부분 갱신으로 받는다
 * (세 PatchSchema 모두 `.partial()`). 서비스가 기존 값을 빼먹고
 * `{...defaults, ...input}` 로 덮어쓰면 명시하지 않은 필드가 기본값으로 되돌아간다.
 *
 * 세 모듈이 복붙이라 같은 결함이 3벌로 복제됐었다. 병합 규칙을 여기서 고정해 둔다.
 */
const merge = <T extends object>(defaults: T, current: Partial<T>, input: Partial<T>): T => ({
  ...defaults,
  ...current,
  ...input,
});

describe('style 부분 갱신 병합', () => {
  it('입력에 없는 필드는 기존 값을 유지한다 (기본값으로 되돌아가지 않는다)', () => {
    const current = { ...defaultPageLineStyle(), strokeWidth: 8 };
    const merged = merge(defaultPageLineStyle(), current, { strokeColor: '#ff0000' });

    expect(merged.strokeWidth).toBe(8); // 덮어쓰기였다면 기본값으로 리셋됐다
    expect(merged.strokeColor).toBe('#ff0000');
  });

  it('기존 값이 비어 있으면 기본값으로 채운다', () => {
    const merged = merge(defaultPageTextStyle(), {}, { fontSize: 32 });

    expect(merged.fontSize).toBe(32);
    expect(merged.fontFamily).toBe(defaultPageTextStyle().fontFamily);
    expect(merged.color).toBe(defaultPageTextStyle().color);
  });

  it('입력이 기존 값을 이긴다', () => {
    const current = { ...defaultSpeechBubbleStyle(), strokeWidth: 5 };
    const merged = merge(defaultSpeechBubbleStyle(), current, { strokeWidth: 1 });

    expect(merged.strokeWidth).toBe(1);
  });

  it('세 도메인 모두 기본값이 완전한 객체다 (부분 병합의 전제)', () => {
    for (const d of [defaultPageLineStyle(), defaultPageTextStyle(), defaultSpeechBubbleStyle()]) {
      expect(Object.values(d).every((v) => v !== undefined)).toBe(true);
    }
  });
});
