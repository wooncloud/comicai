import { describe, expect, it } from 'vitest';
import {
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
  bubbleTextBox,
  wrapText,
} from '@comicai/types';
import { renderSpeechBubbleLayer } from './speech-bubble.render';

const bubble = (over: Partial<Parameters<typeof renderSpeechBubbleLayer>[0][number]> = {}) => ({
  variant: 'ellipse' as const,
  shape: { x: 100, y: 200, w: 240, h: 120 },
  style: defaultSpeechBubbleStyle(),
  text: '',
  textStyle: defaultPageTextStyle(),
  ...over,
});

const svgOf = (b: ReturnType<typeof bubble>) =>
  renderSpeechBubbleLayer([b], 800, 1200)!.toString('utf8');
const tspans = (svg: string) => [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);

describe('말풍선 대사 렌더', () => {
  it('대사가 없으면 <text> 를 아예 만들지 않는다', () => {
    expect(svgOf(bubble())).not.toContain('<text');
    expect(svgOf(bubble({ text: '   ' }))).not.toContain('<text');
  });

  it('대사가 있으면 풍선과 같은 그룹 안에 그린다 — 풍선을 옮기면 같이 간다', () => {
    const svg = svgOf(bubble({ text: '안녕' }));
    expect(svg).toContain('<g transform="translate(100 200)">');
    expect(svg.indexOf('<text')).toBeGreaterThan(svg.indexOf('translate(100 200)'));
    expect(tspans(svg)).toEqual(['안녕']);
  });

  it('줄바꿈은 캔버스와 같은 wrapText 로 끊는다', () => {
    const text = '눈 감지 마. 꿰맬 곳을 봐. 지금이 아니면 다시 못 꿰맨다.';
    const b = bubble({ text });
    const box = bubbleTextBox(b.variant, b.shape.w, b.shape.h);
    const expected = wrapText(text, { maxWidth: box.w, fontSize: b.textStyle.fontSize });
    expect(tspans(svgOf(b))).toEqual(expected);
  });

  it('줄 뭉치가 풍선 세로 한가운데에 온다', () => {
    const b = bubble({ text: '한 줄' });
    const svg = svgOf(b);
    const y = Number(/<tspan[^>]*\by="([-\d.]+)"/.exec(svg)![1]);
    const box = bubbleTextBox(b.variant, b.shape.w, b.shape.h);
    const visualCenter = y - b.textStyle.fontSize * 0.35;
    expect(Math.abs(visualCenter - (box.y + box.h / 2))).toBeLessThan(4);
  });

  it('기본 정렬은 가운데라 풍선 벽에 붙지 않는다', () => {
    expect(svgOf(bubble({ text: '가' }))).toContain('text-anchor="middle"');
  });

  it('사각 풍선은 타원보다 넓은 글자 영역을 쓴다', () => {
    const long = '가나다라마바사아자차카타파하가나다라마바사';
    const e = tspans(svgOf(bubble({ text: long }))).length;
    const r = tspans(svgOf(bubble({ text: long, variant: 'rect' }))).length;
    expect(r).toBeLessThanOrEqual(e);
  });

  it('글자 색이 hex 가 아니면 기본색으로 떨어진다', () => {
    const svg = svgOf(
      bubble({ text: '가', textStyle: { ...defaultPageTextStyle(), color: 'javascript:' } }),
    );
    expect(svg).toContain(`fill="${defaultPageTextStyle().color}"`);
  });
});
