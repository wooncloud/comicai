import { defaultPageTextStyle, type PageTextStyle } from '@comicai/types';
import { svgLayer, svgTextBlock } from './svg';

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
 * 줄바꿈은 `\n` 기준만, 배치는 `svgTextBlock`(말풍선 대사와 같은 계산).
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
  const style = { ...defaultPageTextStyle(), ...t.style };
  const block = svgTextBlock(
    text.split('\n'),
    { x: 0, y: 0, w: Math.max(1, Math.round(t.w)), h: Math.max(1, Math.round(t.h)) },
    style,
  );
  return `<g transform="translate(${Math.round(t.x)} ${Math.round(t.y)})">${block}</g>`;
}
