import {
  bubbleBodyPath,
  bubbleTailPath,
  bubbleTextBox,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
  wrapText,
  type PageTextStyle,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
} from '@comicai/types';
import { escapeAttr, escapeText, safeColor, svgLayer } from './svg';

interface BubbleInput {
  variant: SpeechBubbleVariant;
  shape: SpeechBubbleShape;
  style: SpeechBubbleStyle;
  text: string;
  textStyle: PageTextStyle;
}

/**
 * 말풍선들을 페이지 크기와 동일한 단일 SVG 레이어로 직렬화.
 * sharp.composite는 input이 base canvas보다 크면 거부하므로(말풍선이 페이지 밖으로 나가거나 더 크게
 * 늘어난 경우 발생), 페이지 viewBox에 맞춰 한 번에 그리고 SVG 클리핑에 자연 위임한다.
 * 대사는 풍선이 갖는다 — body + tail 을 그리고 그 안에 글자를 얹는다. 페이지 자유 텍스트
 * (효과음·내레이션)는 여전히 PageText 로 따로 있고 이 레이어 위에 올라간다.
 */
export function renderSpeechBubbleLayer(
  bubbles: readonly BubbleInput[],
  pageW: number,
  pageH: number,
): Buffer | null {
  return svgLayer(bubbles, buildBubbleFragment, pageW, pageH);
}

function buildBubbleFragment(b: BubbleInput): string {
  const W = Math.max(1, Math.round(b.shape.w));
  const H = Math.max(1, Math.round(b.shape.h));
  const x = Math.round(b.shape.x);
  const y = Math.round(b.shape.y);
  const defaults = defaultSpeechBubbleStyle();
  const style = { ...defaults, ...b.style };
  const bodyD = bubbleBodyPath(b.variant, W, H, b.shape.points ?? null);
  const tailD = b.shape.tail ? bubbleTailPath(b.shape.tail.x, b.shape.tail.y, W, H) : null;
  return `<g transform="translate(${x} ${y})">
  <g fill="${safeColor(style.fillColor, defaults.fillColor)}" stroke="${safeColor(style.strokeColor, defaults.strokeColor)}" stroke-width="${style.strokeWidth}" stroke-linejoin="round">
    <path d="${bodyD}" />
    ${tailD ? `<path d="${tailD}" />` : ''}
  </g>
  ${bubbleTextFragment(b, W, H)}
</g>`;
}

/**
 * 풍선 안의 대사.
 *
 * 줄바꿈은 `wrapText` 로 한다 — **캔버스와 같은 함수다.** librsvg 는 `foreignObject` 를
 * 모르므로 CSS 로 접을 수 없고, 양쪽이 각자 접으면 화면과 결과물의 줄 수가 달라진다.
 */
function bubbleTextFragment(b: BubbleInput, W: number, H: number): string {
  const text = b.text.trim();
  if (!text) return '';
  const defaults = defaultPageTextStyle();
  const st = { ...defaults, ...b.textStyle };
  const box = bubbleTextBox(b.variant, W, H);
  const lines = wrapText(text, { maxWidth: box.w, fontSize: st.fontSize });
  if (lines.length === 0) return '';
  const lh = st.fontSize * 1.25;
  const anchor = st.textAlign === 'left' ? 'start' : st.textAlign === 'right' ? 'end' : 'middle';
  const cx = box.x + (st.textAlign === 'left' ? 0 : st.textAlign === 'right' ? box.w : box.w / 2);
  // 줄 뭉치를 글자 영역 세로 한가운데에 — page-text.render.ts 와 같은 계산이다.
  const startY = box.y + (box.h - lines.length * lh) / 2 + st.fontSize;
  const tspans = lines
    .map(
      (l, i) => `<tspan x="${round2(cx)}" y="${round2(startY + i * lh)}">${escapeText(l)}</tspan>`,
    )
    .join('');
  return `<text font-family="${escapeAttr(st.fontFamily)}" font-size="${st.fontSize}" fill="${safeColor(st.color, defaults.color)}" text-anchor="${anchor}" dominant-baseline="alphabetic">${tspans}</text>`;
}

/** SVG 좌표에 소수점이 길게 붙지 않게. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
