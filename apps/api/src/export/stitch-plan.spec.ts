import { describe, expect, it } from 'vitest';
import { planStitchSegments } from './stitch-plan';

/*
 * 여기서 틀리면 **그림 한가운데가 잘린 파일**이 나가거나, 한 파일이 수만 픽셀이
 * 되어 올릴 수 없다. 둘 다 다시 그려야 고쳐진다.
 */
describe('planStitchSegments', () => {
  it('상한 안에 들어가면 한 파일이다', () => {
    expect(planStitchSegments([1000, 1000, 1000], 4000)).toEqual([[0, 1, 2]]);
  });

  it('넘치면 페이지 경계에서 끊는다', () => {
    expect(planStitchSegments([1000, 1000, 1000, 1000], 2500)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('어떤 묶음도 상한을 넘지 않는다 — 한 장이 이미 넘는 경우만 빼고', () => {
    const heights = [900, 1200, 400, 3000, 700, 2000];
    const max = 2500;
    for (const seg of planStitchSegments(heights, max)) {
      const total = seg.reduce((sum, i) => sum + heights[i]!, 0);
      if (seg.length > 1) expect(total).toBeLessThanOrEqual(max);
    }
  });

  it('한 장이 상한보다 길면 그 장만으로 한 파일 — 자르지 않는다', () => {
    expect(planStitchSegments([500, 9000, 500], 2000)).toEqual([[0], [1], [2]]);
  });

  it('모든 페이지가 정확히 한 번씩, 순서대로 들어간다', () => {
    const heights = [300, 800, 1500, 200, 4000, 100];
    const flat = planStitchSegments(heights, 1600).flat();
    expect(flat).toEqual(heights.map((_, i) => i));
  });

  it('페이지가 없으면 파일도 없다', () => {
    expect(planStitchSegments([], 1000)).toEqual([]);
  });
});
