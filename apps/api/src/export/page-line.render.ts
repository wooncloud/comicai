import { defaultPageLineStyle, type PageLineStyle } from '@comicai/types';
import { safeColor, svgLayer } from './svg';

interface PageLineInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: PageLineStyle;
}

/**
 * 페이지 자유 직선들을 페이지 크기 SVG 한 장으로 직렬화.
 * strokeStyle='dashed' 면 strokeWidth*3 대시 패턴.
 */
export function renderPageLineLayer(
  lines: readonly PageLineInput[],
  pageW: number,
  pageH: number,
): Buffer | null {
  return svgLayer(lines, buildLineFragment, pageW, pageH);
}

function buildLineFragment(l: PageLineInput): string {
  const defaults = defaultPageLineStyle();
  const style = { ...defaults, ...l.style };
  const sw = Math.max(0.5, style.strokeWidth);
  const dash = style.strokeStyle === 'dashed' ? ` stroke-dasharray="${sw * 3} ${sw * 3}"` : '';
  const stroke = safeColor(style.strokeColor, defaults.strokeColor);
  return `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash} />`;
}
