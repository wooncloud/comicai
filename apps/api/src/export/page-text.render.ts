import { defaultPageTextStyle, pageTextBox, wrapText, type PageTextStyle } from '@comicai/types';
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
 * 페이지 자유 텍스트들을 페이지 크기 SVG 한 장으로 직렬화. 배치는 `svgTextBlock`
 * (말풍선 대사와 같은 계산).
 *
 * 줄은 캔버스와 **같은 자리(`pageTextBox`)에서 같은 폭으로** `wrapText` 가 끊는다.
 * 예전에는 `\n` 으로만 나눠, 화면에서는 상자 폭에서 접히던 긴 글이 내보낸 PNG 에서는
 * 한 줄로 상자 밖까지 뻗었다.
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
  const box = pageTextBox(Math.max(1, Math.round(t.w)), Math.max(1, Math.round(t.h)));
  const lines = wrapText(text, { maxWidth: box.w, fontSize: style.fontSize });
  const block = svgTextBlock(lines, box, style);
  return `<g transform="translate(${Math.round(t.x)} ${Math.round(t.y)})">${block}</g>`;
}
