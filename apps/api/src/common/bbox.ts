import type { PanelShape } from '@comicai/types';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 패널 shape의 points로부터 bounding box를 계산. 빈 points는 1x1 fallback. */
export function shapeBoundingBox(shape: PanelShape): BoundingBox {
  if (!shape.points.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of shape.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
