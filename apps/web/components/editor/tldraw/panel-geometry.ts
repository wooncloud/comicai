import {
  DIAMOND_POINTS,
  PANEL_ROUND_RADIUS,
  PARALLELOGRAM_POINTS,
  panelShapePath,
  type NormalizedPoint,
  type PanelShapeType,
} from '@comicai/types';

export type { NormalizedPoint };

/** CSS clip-path 문자열 — 배경 이미지를 패널 모양대로 자른다. SVG path와 별개 (CSS 문법). */
export function clipPathFor(
  variant: PanelShapeType,
  _w: number,
  _h: number,
  polygonPoints?: NormalizedPoint[] | null,
): string {
  switch (variant) {
    case 'rect':
      return 'inset(0)';
    case 'rounded':
      return `inset(0 round ${PANEL_ROUND_RADIUS}px)`;
    case 'oval':
      return 'ellipse(50% 50% at 50% 50%)';
    case 'diamond':
      return pctPolygon(DIAMOND_POINTS);
    case 'parallelogram':
      return pctPolygon(PARALLELOGRAM_POINTS);
    case 'polygon':
      return pctPolygon(polygonPoints ?? DIAMOND_POINTS);
  }
}

/** 패널 외곽선 SVG path. 공유 헬퍼에 위임. */
export const outlinePathFor = panelShapePath;

function pctPolygon(points: readonly NormalizedPoint[]): string {
  return `polygon(${points
    .map((p) => `${(p.x * 100).toFixed(3)}% ${(p.y * 100).toFixed(3)}%`)
    .join(',')})`;
}
