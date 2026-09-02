import { defaultPageLineStyle, type PageLineStyle } from '@comicai/types';
import { escapeAttr } from './svg-escape';

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
  if (lines.length === 0) return null;
  const fragments = lines.map(buildLineFragment).filter(Boolean).join('\n');
  if (!fragments) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">${fragments}</svg>`;
  return Buffer.from(svg, 'utf8');
}

function buildLineFragment(l: PageLineInput): string {
  const style = { ...defaultPageLineStyle(), ...l.style };
  const sw = Math.max(0.5, style.strokeWidth);
  const dash = style.strokeStyle === 'dashed' ? ` stroke-dasharray="${sw * 3} ${sw * 3}"` : '';
  return `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${escapeAttr(style.strokeColor)}" stroke-width="${sw}" stroke-linecap="round"${dash} />`;
}
