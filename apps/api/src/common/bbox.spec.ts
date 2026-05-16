import { describe, it, expect } from 'vitest';
import type { PanelShape } from '@comicai/types';
import { shapeBoundingBox } from './bbox';

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
