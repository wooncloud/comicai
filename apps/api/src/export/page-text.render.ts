import { defaultPageTextStyle, type PageTextStyle } from '@comicai/types';

interface PageTextInput {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: PageTextStyle;
}

/**
 * 페이지 자유 텍스트들을 페이지 크기 SVG 한 장으로 직렬화.
 * 캔버스의 `<div>` 렌더와 비주얼적으로 가깝게: bbox 안에 word-wrap 없이 줄바꿈은 `\n` 기준만,
 * 정렬은 textAnchor 로 표현. 줄 높이는 fontSize*1.25.
 */
export function renderPageTextLayer(
  texts: readonly PageTextInput[],
  pageW: number,
  pageH: number,
): Buffer | null {
  if (texts.length === 0) return null;
  const fragments = texts.map(buildTextFragment).filter(Boolean).join('\n');
  if (!fragments) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">${fragments}</svg>`;
  return Buffer.from(svg, 'utf8');
}

function buildTextFragment(t: PageTextInput): string {
  const text = (t.text ?? '').trim();
  if (!text) return '';
  const style = { ...defaultPageTextStyle(), ...t.style };
  const W = Math.max(1, Math.round(t.w));
  const x = Math.round(t.x);
  const y = Math.round(t.y);
  const lines = text.split('\n');
  const lh = style.fontSize * 1.25;
  const anchor =
    style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'middle';
  const cx = style.textAlign === 'left' ? 0 : style.textAlign === 'right' ? W : W / 2;
  // baseline 첫 줄 위치 — div 의 vertical flex-start 와 비슷하게 위에서 시작.
  const startY = style.fontSize;
  const tspans = lines
    .map((l, i) => `<tspan x="${cx}" y="${startY + i * lh}">${escapeText(l)}</tspan>`)
    .join('');
  return `<g transform="translate(${x} ${y})"><text font-family="${escapeAttr(style.fontFamily)}" font-size="${style.fontSize}" fill="${escapeAttr(style.color)}" text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text></g>`;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
