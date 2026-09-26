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
import { safeColor, svgLayer, svgTextBlock } from './svg';

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
  const tail = b.shape.tail;
  const tailD = tail ? bubbleTailPath(tail.x, tail.y, W, H, tail.width) : null;
  const fill = safeColor(style.fillColor, defaults.fillColor);
  const stroke = safeColor(style.strokeColor, defaults.strokeColor);
  /*
   * 순서는 `BUBBLE_DRAW_ORDER` — 선(두 배 굵기, 채움 없이) 먼저, 채움은 그 위에.
   * 채움이 선의 안쪽 절반을 덮어 선이 **바깥쪽으로만** 정한 굵기만큼 남고, 몸통과 꼬리가
   * 만나는 자리의 선도 덮여 둘이 한 덩어리가 된다.
   */
  const paths = tailD ? [tailD, bodyD] : [bodyD];
  return `<g transform="translate(${x} ${y})">
  <g fill="none" stroke="${stroke}" stroke-width="${style.strokeWidth * 2}" stroke-linejoin="round">
    ${paths.map((d) => `<path d="${d}" />`).join('\n    ')}
  </g>
  <g fill="${fill}" stroke="none">
    ${paths.map((d) => `<path d="${d}" />`).join('\n    ')}
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
  const style = { ...defaultPageTextStyle(), ...b.textStyle };
  const box = bubbleTextBox(b.variant, W, H, b.shape.points ?? null);
  return svgTextBlock(wrapText(text, { maxWidth: box.w, fontSize: style.fontSize }), box, style);
}
