import {
  bubbleBodyPath,
  bubbleTailPath,
  flattenTipTapToText,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
  type TipTapDoc,
} from '@comicai/types';

interface RenderArgs {
  variant: SpeechBubbleVariant;
  shape: SpeechBubbleShape;
  style: SpeechBubbleStyle;
  text: TipTapDoc;
}

/**
 * 말풍선을 SVG 문자열로 직렬화 — sharp.composite의 input으로 그대로 사용 가능.
 * 좌표는 bbox 0,0 기준. 호출자가 composite top/left로 페이지 좌표에 배치.
 */
export function renderSpeechBubbleSvg(args: RenderArgs): {
  svg: Buffer;
  left: number;
  top: number;
} {
  const { variant, shape, style, text } = args;
  const W = Math.max(1, Math.round(shape.w));
  const H = Math.max(1, Math.round(shape.h));
  const bodyD = bubbleBodyPath(variant, W, H, shape.points ?? null);
  const tailD = shape.tail ? bubbleTailPath(shape.tail.x, shape.tail.y, W, H) : null;
  const lines = wrapText(flattenTipTapToText(text).trim(), W, style.fontSize);
  const textSvg = lines.length ? buildTextSvg(lines, W, H, style) : '';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g fill="${escapeAttr(style.fillColor)}" stroke="${escapeAttr(style.strokeColor)}" stroke-width="${style.strokeWidth}" stroke-linejoin="round">
    <path d="${bodyD}" />
    ${tailD ? `<path d="${tailD}" />` : ''}
  </g>
  ${textSvg}
</svg>`.trim();

  return {
    svg: Buffer.from(svg, 'utf8'),
    left: Math.round(shape.x),
    top: Math.round(shape.y),
  };
}

function wrapText(text: string, width: number, fontSize: number): string[] {
  if (!text) return [];
  const charsPerLine = Math.max(4, Math.floor((width - 16) / (fontSize * 0.55)));
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (para.length <= charsPerLine) {
      lines.push(para);
      continue;
    }
    let buf = '';
    for (const word of para.split(/(\s+)/)) {
      if ((buf + word).length > charsPerLine && buf.trim()) {
        lines.push(buf.trimEnd());
        buf = word.trimStart();
      } else {
        buf += word;
      }
    }
    if (buf.trim()) lines.push(buf);
  }
  return lines;
}

function buildTextSvg(lines: string[], W: number, H: number, style: SpeechBubbleStyle): string {
  const lh = style.fontSize * 1.25;
  const totalH = lines.length * lh;
  const startY = H / 2 - totalH / 2 + style.fontSize;
  const anchor =
    style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'middle';
  const cx = style.textAlign === 'left' ? 8 : style.textAlign === 'right' ? W - 8 : W / 2;
  const family = style.fontFamily ?? 'sans-serif';
  const tspans = lines
    .map((l, i) => `<tspan x="${cx}" y="${startY + i * lh}">${escapeText(l)}</tspan>`)
    .join('');
  return `<text font-family="${escapeAttr(family)}" font-size="${style.fontSize}" fill="#000000" text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text>`;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
