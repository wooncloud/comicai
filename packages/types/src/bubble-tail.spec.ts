import { describe, expect, it } from 'vitest';
import { bubbleTailPath, defaultTailPoint } from './bubble-path';

describe('defaultTailPoint', () => {
  it('풍선 아래 바깥에 둔다 — 말하는 사람은 대개 아래에 있다', () => {
    const at = defaultTailPoint(200, 100);
    expect(at.x).toBe(100);
    expect(at.y).toBeGreaterThan(100);
  });

  it('작은 풍선에서도 손으로 잡을 만큼 떨어뜨린다', () => {
    expect(defaultTailPoint(40, 20).y - 20).toBeGreaterThanOrEqual(24);
  });
});

/** path 의 세 점을 뽑는다. */
function points(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: +m[1]!, y: +m[2]! }));
}
/** bbox 타원 안인가 — 밑변은 몸통이 덮어야 하므로 안쪽이어야 한다. */
const insideEllipse = (p: { x: number; y: number }, w: number, h: number) =>
  ((p.x - w / 2) / (w / 2)) ** 2 + ((p.y - h / 2) / (h / 2)) ** 2 <= 1.0001;

describe('bubbleTailPath', () => {
  it('세 점 — 밑변 둘과 끝점', () => {
    const pts = points(bubbleTailPath(100, 200, 200, 100));
    expect(pts).toHaveLength(3);
    expect(pts[1]).toEqual({ x: 100, y: 200 }); // 끝점은 요청한 그대로
  });

  it('밑변 두 점이 풍선 안에 있다 — 몸통이 덮어야 선이 삐져나오지 않는다', () => {
    // 2026-09-25: 넓적한 풍선에서 밑변 모서리가 아래 곡선 밖으로 나와 짧은 선처럼 보였다.
    const cases: [number, number, number, number][] = [
      [680, 130, 120, 180], // 아주 넓적
      [300, 160, 150, 250],
      [200, 120, 300, -60], // 오른쪽 위로
      [160, 190, -90, 100], // 왼쪽으로
      [80, 80, 40, 200],
    ];
    for (const [w, h, tx, ty] of cases) {
      const [a, , b] = points(bubbleTailPath(tx, ty, w, h));
      expect(insideEllipse(a!, w, h)).toBe(true);
      expect(insideEllipse(b!, w, h)).toBe(true);
    }
  });

  it('밑변이 풍선 크기에 비례해 넓어진다 — 바늘처럼 가늘지 않게', () => {
    const wide = points(bubbleTailPath(120, 180, 680, 130));
    const width = Math.hypot(wide[0]!.x - wide[2]!.x, wide[0]!.y - wide[2]!.y);
    expect(width).toBeGreaterThan(40);
  });

  it('꼬리가 짧으면 밑변도 같이 좁아진다 — 밑변이 꼬리보다 넓으면 우스워진다', () => {
    const short = points(bubbleTailPath(105, 55, 200, 100)); // 중심 바로 옆
    const w = Math.hypot(short[0]!.x - short[2]!.x, short[0]!.y - short[2]!.y);
    expect(w).toBeLessThan(60);
  });

  it('끝점이 중심과 같아도 터지지 않는다', () => {
    expect(() => bubbleTailPath(100, 50, 200, 100)).not.toThrow();
    expect(bubbleTailPath(100, 50, 200, 100)).toContain('M ');
  });

  it('두께 배율만큼 밑변이 넓어지고 좁아진다', () => {
    const base = (pct?: number) => {
      const [a, , b] = points(bubbleTailPath(100, 200, 200, 100, pct));
      return Math.hypot(a!.x - b!.x, a!.y - b!.y);
    };
    expect(base(50)).toBeLessThan(base(100));
    expect(base(150)).toBeGreaterThan(base(100));
    expect(base(undefined)).toBe(base(100));
  });

  it('아무리 가늘게 해도 밑변이 사라지지 않는다', () => {
    const [a, , b] = points(bubbleTailPath(100, 200, 200, 100, 1));
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(7);
  });
});
