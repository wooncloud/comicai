// 말풍선 SVG path 생성기. 프런트(캔버스 렌더링)와 백엔드(export 합성)가 같은 path 식을 쓰도록 한곳에서.
import type { NormalizedPoint } from './panel-path';
import type { SpeechBubbleVariant } from './index';

export function bubbleBodyPath(
  variant: SpeechBubbleVariant,
  w: number,
  h: number,
  polygonPoints?: readonly NormalizedPoint[] | null,
): string {
  switch (variant) {
    case 'ellipse':
      return ellipsePath(w / 2, h / 2, w / 2 - 1, h / 2 - 1);
    case 'rect': {
      const r = Math.min(w, h) * 0.12;
      return roundedRectPath(1, 1, w - 2, h - 2, r);
    }
    case 'spike':
      return spikePath(w, h);
    case 'polygon': {
      if (!polygonPoints || polygonPoints.length < 3)
        return ellipsePath(w / 2, h / 2, w / 2 - 1, h / 2 - 1);
      const pts = polygonPoints.map((p) => `${p.x * w},${p.y * h}`).join(' L ');
      return `M ${pts} Z`;
    }
  }
}

/**
 * 꼬리를 처음 달 때의 기본 끝점 — 풍선 아래 바깥.
 *
 * 만화에서 말하는 사람은 대개 풍선 아래에 있다. 여기서 시작해 사용자가 끌어 옮긴다.
 */
export function defaultTailPoint(w: number, h: number): { x: number; y: number } {
  return { x: w / 2, y: h + Math.max(24, h * 0.35) };
}

export function bubbleTailPath(tx: number, ty: number, w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const perp = { x: -dy, y: dx };
  const len = Math.hypot(perp.x, perp.y) || 1;
  const span = Math.max(8, Math.min(w, h) * 0.12);
  const ax = cx + (perp.x / len) * span;
  const ay = cy + (perp.y / len) * span;
  const bx = cx - (perp.x / len) * span;
  const by = cy - (perp.y / len) * span;
  return `M ${ax} ${ay} L ${tx} ${ty} L ${bx} ${by} Z`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h - rr}`,
    `Q ${x + w} ${y + h} ${x + w - rr} ${y + h}`,
    `L ${x + rr} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - rr}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    'Z',
  ].join(' ');
}

function spikePath(w: number, h: number): string {
  const n = 12;
  const cx = w / 2;
  const cy = h / 2;
  const rxOuter = w / 2 - 1;
  const ryOuter = h / 2 - 1;
  const rInnerFactor = 0.7;
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const ratio = i % 2 === 0 ? 1 : rInnerFactor;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * rxOuter * ratio},${cy + Math.sin(a) * ryOuter * ratio}`);
  }
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}
