import { describe, expect, it } from 'vitest';
import { defaultPageTextStyle, defaultSpeechBubbleStyle } from '@comicai/types';
import { renderSpeechBubbleLayer } from './speech-bubble.render';

const base = {
  variant: 'ellipse' as const,
  style: defaultSpeechBubbleStyle(),
  text: '',
  textStyle: defaultPageTextStyle(),
};
const svg = (tail: { x: number; y: number } | null) =>
  renderSpeechBubbleLayer(
    [{ ...base, shape: { x: 10, y: 20, w: 200, h: 100, tail } }],
    800,
    1200,
  )!.toString('utf8');

/** 선 묶음(`fill="none"`)과 채움 묶음(`stroke="none"`)의 path 들. */
function groups(s: string): { outline: string[]; fill: string[] } {
  // 바깥 `<g transform>` 말고 선·채움 묶음만 — 둘 다 `fill` 속성으로 시작한다.
  const g = [...s.matchAll(/<g (fill[^>]*)>([\s\S]*?)<\/g>/g)];
  const pathsOf = (attrs: RegExp) =>
    g
      .filter((m) => attrs.test(m[1]!))
      .flatMap((m) => [...m[2]!.matchAll(/<path d="([^"]+)"/g)].map((p) => p[1]!));
  return { outline: pathsOf(/fill="none"/), fill: pathsOf(/stroke="none"/) };
}

describe('말풍선 꼬리 내보내기', () => {
  it('꼬리가 없으면 몸통 하나를 선·채움 두 번 그린다', () => {
    const { outline, fill } = groups(svg(null));
    expect(outline).toHaveLength(1);
    expect(fill).toHaveLength(1);
  });

  /*
   * 선을 **먼저, 두 배 굵기로** 그리고 채움을 위에 덮는다. 선은 경계 가운데에 걸리므로
   * 채움이 안쪽 절반을 덮으면 바깥쪽으로만 정한 굵기가 남는다 — 몸통과 꼬리가 같은 굵기다.
   * 예전 순서(꼬리 → 몸통 → 꼬리 채움)는 마지막 채움이 꼬리 선의 안쪽 절반을 덮어 꼬리
   * 선만 절반 굵기로 보였다(2026-09-26).
   */
  it('선 묶음이 채움 묶음보다 먼저다', () => {
    const s = svg({ x: 100, y: 180 });
    expect(s.indexOf('fill="none"')).toBeGreaterThan(0);
    expect(s.indexOf('fill="none"')).toBeLessThan(s.indexOf('stroke="none"'));
  });

  it('선은 정한 굵기의 두 배로 그린다 — 절반은 채움에 덮인다', () => {
    const w = defaultSpeechBubbleStyle().strokeWidth;
    expect(svg({ x: 100, y: 180 })).toContain(`stroke-width="${w * 2}"`);
  });

  it('꼬리와 몸통 둘 다 선과 채움에 한 번씩, 같은 경로로', () => {
    // 경로가 다르면 채움이 선을 덮지 못하는 틈이 생긴다.
    const { outline, fill } = groups(svg({ x: 100, y: 180 }));
    expect(outline).toHaveLength(2);
    expect(fill).toEqual(outline);
  });

  it('꼬리 두께가 경로에 반영된다', () => {
    const at = (width?: number) =>
      groups(
        renderSpeechBubbleLayer(
          [{ ...base, shape: { x: 10, y: 20, w: 200, h: 100, tail: { x: 100, y: 180, width } } }],
          800,
          1200,
        )!.toString('utf8'),
      ).outline[0];
    expect(at(100)).toBe(at(undefined)); // 두께가 없던 옛 꼬리는 100%
    expect(at(200)).not.toBe(at(100));
  });
});
