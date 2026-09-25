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

/**
 * 꼬리 삼각형.
 *
 * 밑변을 **풍선 테두리 근처**에 둔다. 예전에는 한가운데에 두고 폭도 좁아서(min(w,h)의
 * 0.12), 넓적한 풍선에서는 밖으로 나올 즈음 이미 좁아져 바늘처럼 보였다 — 2026-09-25 에
 * 680×130 풍선에서 실제로 그랬다.
 *
 * 테두리는 bbox 타원으로 근사한다. 사각·뾰족·다각형도 이 근사로 충분하다 — 밑변은
 * 몸통이 덮어 감추므로 조금 안쪽이어도 티가 나지 않는다. 오히려 확실히 덮이도록
 * 일부러 안쪽으로 조금 당긴다.
 */
export function bubbleTailPath(tx: number, ty: number, w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  // 그 방향에서 bbox 타원의 반지름.
  const rx = w / 2;
  const ry = h / 2;
  const denom = Math.hypot(ry * ux, rx * uy) || 1;
  const edge = (rx * ry) / denom;

  /*
   * 밑변 중심은 테두리보다 **넉넉히** 안쪽에 둔다.
   *
   * 테두리에 바짝 붙이면, 넓적한 풍선에서 밑변 양 끝이 아래쪽 곡선 밖으로 삐져나와
   * 풍선에 붙은 짧은 선처럼 보인다. 안쪽으로 당기면 몸통이 밑변을 통째로 덮는다.
   */
  const baseDist = Math.min(dist * 0.55, edge * 0.5);
  const bxc = cx + ux * baseDist;
  const byc = cy + uy * baseDist;

  // 밑변 폭은 풍선 크기에 비례하되 꼬리 길이보다 넓어지지 않게.
  const half = Math.max(10, Math.min(Math.min(w, h) * 0.28, dist * 0.45));
  const ax = bxc - uy * half;
  const ay = byc + ux * half;
  const bx = bxc + uy * half;
  const by = byc - ux * half;
  return `M ${round2(ax)} ${round2(ay)} L ${round2(tx)} ${round2(ty)} L ${round2(bx)} ${round2(by)} Z`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
