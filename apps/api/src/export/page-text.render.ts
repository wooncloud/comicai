import { defaultPageTextStyle, type PageTextStyle } from '@comicai/types';
import { escapeAttr, escapeText, safeColor, svgLayer } from './svg';

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
 * 가로 정렬은 textAnchor 로, 세로는 줄 뭉치를 상자 가운데에 놓아 표현. 줄 높이는 fontSize*1.25.
 */
export function renderPageTextLayer(
  texts: readonly PageTextInput[],
  pageW: number,
  pageH: number,
): Buffer | null {
  return svgLayer(texts, buildTextFragment, pageW, pageH);
}

function buildTextFragment(t: PageTextInput): string {
  const text = t.text.trim();
  if (!text) return '';
  const defaults = defaultPageTextStyle();
  const style = { ...defaults, ...t.style };
  const W = Math.max(1, Math.round(t.w));
  const H = Math.max(1, Math.round(t.h));
  const x = Math.round(t.x);
  const y = Math.round(t.y);
  const lines = text.split('\n');
  const lh = style.fontSize * 1.25;
  const anchor =
    style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'middle';
  const cx = style.textAlign === 'left' ? 0 : style.textAlign === 'right' ? W : W / 2;
  /*
   * 첫 줄의 baseline.
   *
   * 캔버스는 `align-items: center` 로 줄 뭉치를 상자 가운데에 놓는다(`page-text-shape.tsx`).
   * 여기서도 같은 그림이 나와야 한다 — 내보낸 PNG 에서만 글자가 위로 붙으면,
   * 화면에서 말풍선 한가운데에 맞춰 둔 대사가 결과물에서 천장에 붙어 나온다.
   *
   * 줄 뭉치 높이는 `줄수 × lh`, 그 윗변은 `(H - 뭉치높이) / 2`. 한 줄 안에서 baseline 은
   * 위에서 `fontSize` 만큼 내려온 자리다(기존 상단 정렬이 쓰던 값 그대로).
   */
  const startY = (H - lines.length * lh) / 2 + style.fontSize;
  const tspans = lines
    .map((l, i) => `<tspan x="${cx}" y="${round2(startY + i * lh)}">${escapeText(l)}</tspan>`)
    .join('');
  return `<g transform="translate(${x} ${y})"><text font-family="${escapeAttr(style.fontFamily)}" font-size="${style.fontSize}" fill="${safeColor(style.color, defaults.color)}" text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text></g>`;
}

/** SVG 좌표에 소수점이 길게 붙지 않게. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
