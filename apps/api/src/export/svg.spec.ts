import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeText, safeColor, svgDocument, svgLayer } from './svg';

/**
 * 색 검증은 **읽는 쪽에도** 있어야 한다. 새 입력은 Zod 가 막지만, 그 검증이 생기기 전에
 * 저장된 행은 거치지 않았다. 예전에는 패널 외곽선만 폴백을 갖고 있었고 말풍선·텍스트·직선은
 * 저장된 문자열을 그대로 SVG 속성에 넣었다 — 캔버스와 export 가 다르게 보이는데 어느 쪽도
 * 오류를 내지 않는다.
 */
describe('safeColor', () => {
  it('hex 는 그대로', () => {
    expect(safeColor('#ff0000', '#000000')).toBe('#ff0000');
    expect(safeColor('#f00', '#000000')).toBe('#f00');
    expect(safeColor('#ff0000aa', '#000000')).toBe('#ff0000aa');
  });

  it('hex 가 아니면 폴백 — 옛 행이 export 만 다르게 만들지 않는다', () => {
    expect(safeColor('not-a-color', '#111111')).toBe('#111111');
    expect(safeColor('red', '#111111')).toBe('#111111');
    expect(safeColor('', '#111111')).toBe('#111111');
    expect(safeColor(null, '#111111')).toBe('#111111');
    expect(safeColor(undefined, '#111111')).toBe('#111111');
  });

  it('속성을 깨뜨릴 수 있는 문자열도 폴백으로 걸러진다', () => {
    expect(safeColor('" onload="x', '#000000')).toBe('#000000');
  });
});

describe('svgLayer', () => {
  const doc = (b: Buffer | null) => b?.toString('utf8') ?? null;

  it('그릴 것이 없으면 null — 호출부가 합성에서 뺀다', () => {
    expect(svgLayer([], () => '<x/>', 10, 20)).toBeNull();
  });

  it('조각이 전부 비면 null (빈 텍스트만 있는 레이어)', () => {
    expect(svgLayer(['a', 'b'], () => '', 10, 20)).toBeNull();
  });

  it('빈 조각은 걸러내고 나머지를 합친다', () => {
    const out = doc(svgLayer(['a', '', 'b'], (v) => (v ? `<t>${v}</t>` : ''), 10, 20));
    expect(out).toContain('<t>a</t>');
    expect(out).toContain('<t>b</t>');
  });

  it('페이지 크기를 width/height/viewBox 에 모두 싣는다 (sharp 합성 전제)', () => {
    const out = doc(svgLayer(['a'], () => '<x/>', 800, 1200));
    expect(out).toContain('width="800"');
    expect(out).toContain('height="1200"');
    expect(out).toContain('viewBox="0 0 800 1200"');
  });
});

describe('svgDocument', () => {
  it('본문을 그대로 감싼다', () => {
    expect(svgDocument(5, 6, '<path d="M0 0"/>').toString('utf8')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="6" viewBox="0 0 5 6"><path d="M0 0"/></svg>',
    );
  });
});

describe('escape', () => {
  it('속성값의 따옴표·꺾쇠를 막는다', () => {
    expect(escapeAttr('a"b<c&d')).toBe('a&quot;b&lt;c&amp;d');
  });

  it('텍스트 노드의 꺾쇠를 막는다', () => {
    expect(escapeText('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
  });
});
