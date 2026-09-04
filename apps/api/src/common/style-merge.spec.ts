import { describe, expect, it } from 'vitest';
import {
  defaultPageLineStyle,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
} from '@comicai/types';
import { mergeStyle as merge } from './style-merge';

/**
 * page-lines / page-texts / speech-bubbles 의 patch 는 style 을 부분 갱신으로 받는다
 * (세 PatchSchema 모두 `.partial()`). 서비스가 기존 값을 빼먹고
 * `{...defaults, ...input}` 로 덮어쓰면 명시하지 않은 필드가 기본값으로 되돌아간다.
 *
 * **예전에는 이 파일 안에 `merge` 가 따로 정의돼 있었다.** 그래서 여기서 고정한 규칙과
 * 실제로 도는 코드가 서로 다른 것이었다 — 세 서비스는 각자 병합하고 있었고, 이 테스트가
 * 통과해도 그들이 규칙을 지킨다는 보장이 없었다. 지금은 서비스가 쓰는 바로 그 함수를
 * 가져온다(`style-merge.ts`).
 */
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

  it('없는 레이어(undefined/null)는 건너뛴다 — 호출부가 `?? {}` 를 쓰지 않아도 된다', () => {
    const merged = merge(defaultPageLineStyle(), null, undefined, { strokeWidth: 7 });
    expect(merged.strokeWidth).toBe(7);
    expect(merged.strokeColor).toBe(defaultPageLineStyle().strokeColor);
  });

  it('원본 defaults 를 건드리지 않는다', () => {
    const defaults = defaultPageTextStyle();
    merge(defaults, { fontSize: 99 });
    expect(defaults.fontSize).toBe(defaultPageTextStyle().fontSize);
  });

  it('세 도메인 모두 기본값이 완전한 객체다 (부분 병합의 전제)', () => {
    for (const d of [defaultPageLineStyle(), defaultPageTextStyle(), defaultSpeechBubbleStyle()]) {
      expect(Object.values(d).every((v) => v !== undefined)).toBe(true);
    }
  });
});
