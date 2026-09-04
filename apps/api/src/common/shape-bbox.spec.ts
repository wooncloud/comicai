import { describe, it, expect } from 'vitest';
import type { PanelShape } from '@comicai/types';
import { normalizePolygonPoints, shapeBoundingBox } from '@comicai/types';

function rect(x: number, y: number, w: number, h: number): PanelShape {
  return {
    type: 'rect',
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    strokeColor: '#000',
    strokeWidth: 1,
  };
}

describe('shapeBoundingBox', () => {
  it('returns the rectangle bbox of a rect shape', () => {
    expect(shapeBoundingBox(rect(10, 20, 100, 50))).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('returns 1x1 fallback for empty points', () => {
    const empty: PanelShape = { type: 'rect', points: [], strokeColor: '#000', strokeWidth: 1 };
    expect(shapeBoundingBox(empty)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('handles polygon with mixed point order', () => {
    const polygon: PanelShape = {
      type: 'polygon',
      points: [
        { x: 50, y: 100 },
        { x: 10, y: 200 },
        { x: 120, y: 50 },
      ],
      strokeColor: '#000',
      strokeWidth: 1,
    };
    expect(shapeBoundingBox(polygon)).toEqual({ x: 10, y: 50, w: 110, h: 150 });
  });
});

/**
 * 정규화 규칙을 여기서 고정한다. 같은 변환이 서버·웹에 세 벌 있었고 **퇴화 처리가 셋 다
 * 달랐다** — 그중 둘은 0..1 이 아닌 좌표를 만들거나 도형을 한 점으로 무너뜨렸다.
 * 결과가 틀린 모양인데 오류는 아니라서 아무도 눈치채지 못한다.
 */
describe('normalizePolygonPoints', () => {
  it('bbox 기준 0..1 로 옮긴다', () => {
    expect(
      normalizePolygonPoints([
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 120 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('폭이 0 이면 null — 정규화할 수 없는 입력에는 답이 없다', () => {
    expect(
      normalizePolygonPoints([
        { x: 5, y: 0 },
        { x: 5, y: 10 },
      ]),
    ).toBeNull();
  });

  it('높이가 0 이어도 null', () => {
    expect(
      normalizePolygonPoints([
        { x: 0, y: 7 },
        { x: 10, y: 7 },
      ]),
    ).toBeNull();
  });
});
