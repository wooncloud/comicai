import type {
  SpeechBubbleShape,
  SpeechBubbleStyle,
  SpeechBubbleVariant,
  TipTapDoc,
  TipTapNode,
} from '@comicai/types';

/** TipTapDoc → 단순 텍스트(줄바꿈 보존). 멘션은 라벨로 평탄화. */
export function flattenTipTapToText(doc: TipTapDoc | null | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  for (const para of doc.content ?? []) {
    lines.push(extractLine(para));
  }
  return lines.join('\n').trim();
}

function extractLine(node: TipTapNode): string {
  if (node.type === 'text') return node.text;
  if (node.type === 'mention') return node.attrs.label;
  if (node.type === 'hardBreak') return '\n';
  if ('content' in node && Array.isArray(node.content)) {
    return node.content.map(extractLine).join('');
  }
  return '';
}

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
  const path = buildBubblePath(variant, W, H, shape);
  const tail = shape.tail ? buildTailPath(shape, W, H) : '';
  const lines = wrapText(flattenTipTapToText(text), W, style.fontSize);
  const textSvg = lines.length ? buildTextSvg(lines, W, H, style) : '';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g fill="${escapeAttr(style.fillColor)}" stroke="${escapeAttr(style.strokeColor)}" stroke-width="${style.strokeWidth}" stroke-linejoin="round">
    ${path}
    ${tail}
  </g>
  ${textSvg}
</svg>`.trim();

  return {
    svg: Buffer.from(svg, 'utf8'),
    left: Math.round(shape.x),
    top: Math.round(shape.y),
  };
}

function buildBubblePath(
  variant: SpeechBubbleVariant,
  W: number,
  H: number,
  shape: SpeechBubbleShape,
): string {
  switch (variant) {
    case 'ellipse':
      return `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W / 2 - 1}" ry="${H / 2 - 1}" />`;
    case 'rect': {
      const r = Math.min(W, H) * 0.12;
      return `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${r}" ry="${r}" />`;
    }
    case 'cloud':
      return `<path d="${cloudPath(W, H)}" />`;
    case 'spike':
      return `<path d="${spikePath(W, H)}" />`;
    case 'thought':
      // 본체 + 작은 원들은 tail 경로로 처리하지 않고 본체와 함께 그림
      return `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W / 2 - 1}" ry="${H / 2 - 1}" />`;
    case 'polygon': {
      const pts = (shape.points ?? []).map((p) => `${p.x * W},${p.y * H}`).join(' ');
      return pts ? `<polygon points="${pts}" />` : '';
    }
  }
}

function buildTailPath(shape: SpeechBubbleShape, W: number, H: number): string {
  if (!shape.tail) return '';
  const tx = shape.tail.x;
  const ty = shape.tail.y;
  // 본체 경계에서 가장 가까운 가장자리 두 점을 골라 삼각형으로 연결.
  const cx = W / 2;
  const cy = H / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const perp = { x: -dy, y: dx };
  const len = Math.hypot(perp.x, perp.y) || 1;
  const span = Math.max(8, Math.min(W, H) * 0.12);
  const ax = cx + (perp.x / len) * span;
  const ay = cy + (perp.y / len) * span;
  const bx = cx - (perp.x / len) * span;
  const by = cy - (perp.y / len) * span;
  return `<path d="M ${ax} ${ay} L ${tx} ${ty} L ${bx} ${by} Z" />`;
}

function cloudPath(W: number, H: number): string {
  // 6개 원형 bump 가 합쳐진 듯한 path. 단순화 — 타원 + 작은 호들 흉내.
  const k = 0.18;
  const rx = W * 0.45;
  const ry = H * 0.45;
  const cx = W / 2;
  const cy = H / 2;
  // 단순화된 형상 (closed path with bumps)
  return [
    `M ${cx - rx} ${cy}`,
    `Q ${cx - rx} ${cy - ry * (1 + k)} ${cx - rx * 0.5} ${cy - ry}`,
    `Q ${cx} ${cy - ry * (1 + k)} ${cx + rx * 0.5} ${cy - ry}`,
    `Q ${cx + rx} ${cy - ry * (1 + k)} ${cx + rx} ${cy}`,
    `Q ${cx + rx} ${cy + ry * (1 + k)} ${cx + rx * 0.5} ${cy + ry}`,
    `Q ${cx} ${cy + ry * (1 + k)} ${cx - rx * 0.5} ${cy + ry}`,
    `Q ${cx - rx} ${cy + ry * (1 + k)} ${cx - rx} ${cy}`,
    `Z`,
  ].join(' ');
}

function spikePath(W: number, H: number): string {
  // 외곽이 톱니인 폭발형 (12개 스파이크)
  const n = 12;
  const cx = W / 2;
  const cy = H / 2;
  const rOuter = Math.min(W, H) / 2 - 1;
  const rInner = rOuter * 0.7;
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * (r * (H / W || 1))}`);
  }
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}

function wrapText(text: string, width: number, fontSize: number): string[] {
  if (!text) return [];
  // 매우 단순한 wrap — 문자수 기준. (정확한 측정은 sharp/SVG 렌더러에 위임 곤란)
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
