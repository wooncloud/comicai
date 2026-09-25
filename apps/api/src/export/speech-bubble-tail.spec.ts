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

  it('꼬리가 있으면 두 개', () => {
    expect((svg(defaultTailPoint(200, 100)).match(/<path /g) ?? []).length).toBe(2);
  });

  it('꼬리를 몸통보다 먼저 그린다 — 삼각형 밑변이 풍선 안에서 보이면 안 된다', () => {
    const s = svg({ x: 100, y: 180 });
    const first = s.indexOf('<path ');
    const second = s.indexOf('<path ', first + 1);
    // 몸통은 타원 path(A 명령 포함), 꼬리는 직선 삼각형
    expect(s.slice(first, second)).not.toContain(' A ');
    expect(s.slice(second)).toContain(' A ');
  });
});
