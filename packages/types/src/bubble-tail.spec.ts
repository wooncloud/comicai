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

describe('bubbleTailPath', () => {
  it('삼각형 세 점 — 밑변 둘은 풍선 중심 근처, 꼭짓점은 끝점', () => {
    const d = bubbleTailPath(100, 200, 200, 100);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums).toHaveLength(6);
    expect(d).toContain('L 100 200'); // 끝점
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('끝점이 중심과 같아도 터지지 않는다', () => {
    expect(() => bubbleTailPath(100, 50, 200, 100)).not.toThrow();
    expect(bubbleTailPath(100, 50, 200, 100)).toContain('M ');
  });
});
