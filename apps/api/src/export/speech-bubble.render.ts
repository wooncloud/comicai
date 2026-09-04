import {
  bubbleBodyPath,
  bubbleTailPath,
  defaultSpeechBubbleStyle,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
} from '@comicai/types';
import { safeColor, svgLayer } from './svg';

interface BubbleInput {
  variant: SpeechBubbleVariant;
  shape: SpeechBubbleShape;
  style: SpeechBubbleStyle;
}

/**
 * 말풍선들을 페이지 크기와 동일한 단일 SVG 레이어로 직렬화.
 * sharp.composite는 input이 base canvas보다 크면 거부하므로(말풍선이 페이지 밖으로 나가거나 더 크게
 * 늘어난 경우 발생), 페이지 viewBox에 맞춰 한 번에 그리고 SVG 클리핑에 자연 위임한다.
 * 텍스트는 PageText 로 분리됨 — 여기선 body + tail 만.
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
</g>`;
}
