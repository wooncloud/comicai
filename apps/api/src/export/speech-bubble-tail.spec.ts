import { describe, expect, it } from 'vitest';
import { defaultPageTextStyle, defaultSpeechBubbleStyle, defaultTailPoint } from '@comicai/types';
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

describe('말풍선 꼬리 내보내기', () => {
  it('꼬리가 없으면 path 가 하나뿐이다', () => {
    expect((svg(null).match(/<path /g) ?? []).length).toBe(1);
  });

  /*
   * 꼬리·몸통·꼬리(채움만) 세 번. 마지막 채움이 **몸통 테두리가 꼬리를 가로지르는
   * 구간**을 덮어, 둘이 한 덩어리로 보인다. 그게 없으면 꼬리가 풍선에 붙은 별개의
   * 삼각형으로 읽힌다 — 2026-09-25 에 실제로 그렇게 나왔다.
   */
  it('꼬리가 있으면 꼬리·몸통·꼬리채움 세 개', () => {
    expect((svg(defaultTailPoint(200, 100)).match(/<path /g) ?? []).length).toBe(3);
  });

  it('순서는 꼬리 → 몸통 → 꼬리(선 없이)', () => {
    const s = svg({ x: 100, y: 180 });
    const paths = [...s.matchAll(/<path [^>]*>/g)].map((m) => m[0]);
    expect(paths).toHaveLength(3);
    // 몸통은 타원 path(A 명령 포함), 꼬리는 직선 삼각형이라 A 가 없다.
    expect(paths[0]).not.toContain(' A ');
    expect(paths[1]).toContain(' A ');
    expect(paths[2]).not.toContain(' A ');
    // 마지막 한 번은 선을 그리지 않는다 — 그리면 덮으려던 자리에 선이 다시 생긴다.
    expect(paths[0]).not.toContain('stroke="none"');
    expect(paths[2]).toContain('stroke="none"');
  });

  it('덮는 꼬리는 처음 그린 꼬리와 같은 경로다', () => {
    // 다르면 덮이지 않는 틈이 생긴다.
    const paths = [...svg({ x: 100, y: 180 }).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths[2]).toBe(paths[0]);
  });
});
