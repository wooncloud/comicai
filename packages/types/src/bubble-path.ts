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
  // 풍선 높이에 비례하되 바닥과 천장을 둔다. 너무 짧으면 넓적한 풍선에서 꼬리가
  // 거의 안 보이고, 너무 길면 처음부터 화면을 가로지른다.
  return { x: w / 2, y: h + Math.max(32, Math.min(h * 0.6, 100)) };
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

  /*
   * 밑변 폭은 **그 방향의 테두리 크기**에 맞춘다.
   *
   * min(w,h) 로 잡으면 넓적한 풍선에서 꼬리가 아래로 길게 빠질 때 비율이 가늘어진다 —
   * 정작 그 자리는 풍선이 가장 넓은 곳인데도. 꼬리 길이로도 묶어, 짧은 꼬리에
   * 넓은 밑변이 붙는 우스운 모양을 막는다.
   */
  const half = Math.max(10, Math.min(edge * 0.45, dist * 0.45));
  const a = clampInside(bxc - uy * half, byc + ux * half, cx, cy, rx, ry);
  const b = clampInside(bxc + uy * half, byc - ux * half, cx, cy, rx, ry);
  return `M ${round2(a.x)} ${round2(a.y)} L ${round2(tx)} ${round2(ty)} L ${round2(b.x)} ${round2(b.y)} Z`;
}

/**
 * 점을 bbox 타원 안으로 끌어당긴다.
 *
 * 밑변을 넓히면 모서리가 테두리 밖으로 나가 풍선에 붙은 짧은 선처럼 보인다. 폭을
 * 줄이는 대신 모서리만 테두리로 당기면, 넓은 밑변을 지키면서도 몸통이 확실히 덮는다.
 */
function clampInside(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { x: number; y: number } {
  const t = Math.hypot((px - cx) / rx, (py - cy) / ry);
  // 0.92: 테두리 선 두께 아래로 확실히 들어가게 조금 더 당긴다.
  if (t <= 0.92) return { x: px, y: py };
  const k = 0.92 / t;
  return { x: cx + (px - cx) * k, y: cy + (py - cy) * k };
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
