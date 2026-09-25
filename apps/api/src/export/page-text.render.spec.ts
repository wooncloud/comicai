import { describe, expect, it } from 'vitest';
import { defaultPageTextStyle, pageTextBox, wrapText } from '@comicai/types';
import { renderPageTextLayer } from './page-text.render';

/** 렌더 결과 SVG 에서 tspan 의 y 좌표만 뽑는다. */
function baselines(svg: string): number[] {
  return [...svg.matchAll(/<tspan[^>]*\by="([-\d.]+)"/g)].map((m) => Number(m[1]));
}

const box = { x: 100, y: 200, w: 200, h: 60 };
/** 서비스가 넘겨주는 것과 같은 '완전한' 스타일. */
const style = (over: Partial<ReturnType<typeof defaultPageTextStyle>> = {}) => ({
  ...defaultPageTextStyle(),
  ...over,
});

describe('renderPageTextLayer — 세로 가운데', () => {
  it('한 줄은 상자 세로 한가운데에 온다', () => {
    const buf = renderPageTextLayer([{ ...box, text: '안녕', style: style() }], 800, 1200);
    const svg = buf!.toString('utf8');
    const [y] = baselines(svg);
    // fontSize 24, lh 30 → 윗변 (60-30)/2 = 15, baseline 15+24 = 39
    expect(y).toBe(39);
    // 글자의 시각적 중심(baseline - 약 0.35em)이 상자 중심 30 근처여야 한다
    expect(Math.abs(y! - 24 * 0.35 - box.h / 2)).toBeLessThan(3);
  });

  it('여러 줄도 뭉치째 가운데', () => {
    const buf = renderPageTextLayer(
      [{ ...box, h: 120, text: '한 줄\n두 줄\n세 줄', style: style() }],
      800,
      1200,
    );
    const ys = baselines(buf!.toString('utf8'));
    expect(ys).toHaveLength(3);
    const lh = 24 * 1.25;
    // 줄 간격은 그대로 lh
    expect(ys[1]! - ys[0]!).toBeCloseTo(lh, 5);
    // 뭉치의 위아래 여백이 같다
    const top = ys[0]! - 24;
    const bottom = 120 - (ys[2]! - 24 + lh);
    expect(Math.abs(top - bottom)).toBeLessThan(0.01);
  });

  it('상자보다 글이 길면 위로 넘치되 줄 간격은 유지된다', () => {
    const buf = renderPageTextLayer(
      [{ ...box, h: 20, text: '가\n나\n다', style: style() }],
      800,
      1200,
    );
    const ys = baselines(buf!.toString('utf8'));
    expect(ys[1]! - ys[0]!).toBeCloseTo(30, 5);
    expect(ys[0]!).toBeLessThan(24); // 상자가 작으니 첫 줄이 위로 올라간다
  });
});

describe('기본 스타일', () => {
  it('가로 기본 정렬이 가운데라 말풍선 안에서 중앙에 놓인다', () => {
    expect(defaultPageTextStyle().textAlign).toBe('center');
    const svg = renderPageTextLayer(
      [{ ...box, text: '대사', style: style() }],
      800,
      1200,
    )!.toString('utf8');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain(`x="${box.w / 2}"`);
  });

  it('사용자가 왼쪽으로 바꾸면 그대로 따른다', () => {
    const svg = renderPageTextLayer(
      [{ ...box, text: '내레이션', style: style({ textAlign: 'left' }) }],
      800,
      1200,
    )!.toString('utf8');
    expect(svg).toContain('text-anchor="start"');
    // 캔버스와 같은 안쪽 여백(`pageTextBox`) — 왼쪽 정렬 글이 상자 선에 붙지 않는다.
    expect(svg).toContain('x="2"');
  });
});

describe('줄바꿈 — 캔버스와 같은 폭에서 접는다', () => {
  it('상자보다 긴 글은 여러 줄이 된다', () => {
    const svg = renderPageTextLayer(
      [
        {
          ...box,
          h: 200,
          text: '가나다라마바사아자차카타파하 가나다라마바사아자차',
          style: style(),
        },
      ],
      800,
      1200,
    )!.toString('utf8');
    // 예전에는 `\n` 으로만 나눠 한 줄로 상자 밖까지 뻗었다.
    expect(baselines(svg).length).toBeGreaterThan(1);
  });

  it('캔버스와 같은 함수·같은 폭이다', () => {
    const text = '말풍선 밖에 두는 긴 내레이션 한 문장이 상자 폭을 넘는다';
    const { w, h } = box;
    const expected = wrapText(text, { maxWidth: pageTextBox(w, h).w, fontSize: 24 });
    const svg = renderPageTextLayer([{ ...box, text, style: style() }], 800, 1200)!.toString(
      'utf8',
    );
    expect(baselines(svg)).toHaveLength(expected.length);
  });
});
