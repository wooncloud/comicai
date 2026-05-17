import {
  bubbleBodyPath,
  bubbleTailPath,
  defaultSpeechBubbleStyle,
  flattenTipTapToText,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
  type TipTapDoc,
} from '@comicai/types';

interface BubbleInput {
  variant: SpeechBubbleVariant;
  shape: SpeechBubbleShape;
  style: SpeechBubbleStyle;
  text: TipTapDoc;
}

/**
 * 말풍선들을 페이지 크기와 동일한 단일 SVG 레이어로 직렬화.
 * sharp.composite는 input이 base canvas보다 크면 거부하므로(말풍선이 페이지 밖으로 나가거나 더 크게
 * 늘어난 경우 발생), 페이지 viewBox에 맞춰 한 번에 그리고 SVG 클리핑에 자연 위임한다.
 */
export function renderSpeechBubbleLayer(
  bubbles: readonly BubbleInput[],
  pageW: number,
  pageH: number,
): Buffer | null {
  if (bubbles.length === 0) return null;
  const fragments = bubbles.map(buildBubbleFragment).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">${fragments}</svg>`;
  return Buffer.from(svg, 'utf8');
}

function buildBubbleFragment(b: BubbleInput): string {
  const W = Math.max(1, Math.round(b.shape.w));
  const H = Math.max(1, Math.round(b.shape.h));
  const x = Math.round(b.shape.x);
  const y = Math.round(b.shape.y);
  const style = { ...defaultSpeechBubbleStyle(), ...b.style };
  const bodyD = bubbleBodyPath(b.variant, W, H, b.shape.points ?? null);
  const tailD = b.shape.tail ? bubbleTailPath(b.shape.tail.x, b.shape.tail.y, W, H) : null;
  const lines = wrapText(flattenTipTapToText(b.text).trim(), W, style.fontSize);
  const textSvg = lines.length ? buildTextSvg(lines, W, H, style) : '';
  return `<g transform="translate(${x} ${y})">
  <g fill="${escapeAttr(style.fillColor)}" stroke="${escapeAttr(style.strokeColor)}" stroke-width="${style.strokeWidth}" stroke-linejoin="round">
    <path d="${bodyD}" />
    ${tailD ? `<path d="${tailD}" />` : ''}
  </g>
  ${textSvg}
</g>`;
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
