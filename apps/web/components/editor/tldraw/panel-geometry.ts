import type { PanelShapeType } from '@comicai/types';

export type NormalizedPoint = { x: number; y: number };

/** 다이아몬드/평행사변형의 시각적 비율(0..1 단위, bbox 내부). */
const DIAMOND_POINTS: NormalizedPoint[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
];
const PARALLELOGRAM_POINTS: NormalizedPoint[] = [
  { x: 0.18, y: 0 },
  { x: 1, y: 0 },
  { x: 0.82, y: 1 },
  { x: 0, y: 1 },
];

const ROUND_RADIUS = 14; // px

/** CSS clip-path 문자열. <div>의 background를 이 모양대로 잘라낸다. */
export function clipPathFor(
  variant: PanelShapeType,
  w: number,
  h: number,
  polygonPoints?: NormalizedPoint[] | null,
): string {
  switch (variant) {
    case 'rect':
      return 'inset(0)';
    case 'rounded':
      return `inset(0 round ${ROUND_RADIUS}px)`;
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

/** 외곽선 SVG path(d 속성). w/h 픽셀 좌표계. */
export function outlinePathFor(
  variant: PanelShapeType,
  w: number,
  h: number,
  polygonPoints?: NormalizedPoint[] | null,
): string {
  switch (variant) {
    case 'rect':
      return `M 0 0 H ${w} V ${h} H 0 Z`;
    case 'rounded': {
      const r = Math.min(ROUND_RADIUS, w / 2, h / 2);
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    }
    case 'oval': {
      const rx = w / 2;
      const ry = h / 2;
      return `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${w} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`;
    }
    case 'diamond':
      return absolutePolygonPath(DIAMOND_POINTS, w, h);
    case 'parallelogram':
      return absolutePolygonPath(PARALLELOGRAM_POINTS, w, h);
    case 'polygon':
      return absolutePolygonPath(polygonPoints ?? DIAMOND_POINTS, w, h);
  }
}

function pctPolygon(points: NormalizedPoint[]): string {
  return `polygon(${points
    .map((p) => `${(p.x * 100).toFixed(3)}% ${(p.y * 100).toFixed(3)}%`)
    .join(',')})`;
}

function absolutePolygonPath(points: NormalizedPoint[], w: number, h: number): string {
  if (points.length === 0) return '';
  const segments: string[] = [];
  points.forEach((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    segments.push(`${cmd} ${(p.x * w).toFixed(2)} ${(p.y * h).toFixed(2)}`);
  });
  segments.push('Z');
  return segments.join(' ');
}
