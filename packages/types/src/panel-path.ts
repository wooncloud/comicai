// 패널 모양 SVG path를 생성하는 공유 헬퍼. 프런트(테두리/clip), 백엔드(export 알파 마스크) 양쪽이
// 같은 좌표계를 쓰도록 — 따로 두면 ROUND_RADIUS/PRESET 좌표가 갈라질 위험.
import type { PanelShapeType } from './index';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export const PANEL_ROUND_RADIUS = 14;

export const DIAMOND_POINTS: readonly NormalizedPoint[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
];

export const PARALLELOGRAM_POINTS: readonly NormalizedPoint[] = [
  { x: 0.18, y: 0 },
  { x: 1, y: 0 },
  { x: 0.82, y: 1 },
  { x: 0, y: 1 },
];

/**
 * 모양별 SVG path(`d`) 문자열. 좌표계는 (0,0)~(w,h).
 * polygon 모양은 정규화 vertex 배열을 넘기면 그대로 사용, 누락 시 diamond로 폴백.
 */
export function panelShapePath(
  type: PanelShapeType,
  w: number,
  h: number,
  polygonPoints?: readonly NormalizedPoint[] | null,
): string {
  switch (type) {
    case 'rect':
      return `M 0 0 H ${w} V ${h} H 0 Z`;
    case 'rounded': {
      const r = Math.min(PANEL_ROUND_RADIUS, w / 2, h / 2);
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    }
    case 'oval': {
      const rx = w / 2;
      const ry = h / 2;
      return `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${w} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`;
    }
    case 'diamond':
      return polygonPath(DIAMOND_POINTS, w, h);
    case 'parallelogram':
      return polygonPath(PARALLELOGRAM_POINTS, w, h);
    case 'polygon':
      return polygonPath(polygonPoints ?? DIAMOND_POINTS, w, h);
  }
}

function polygonPath(points: readonly NormalizedPoint[], w: number, h: number): string {
  if (points.length === 0) return '';
  const segments: string[] = [];
  points.forEach((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    segments.push(`${cmd} ${(p.x * w).toFixed(2)} ${(p.y * h).toFixed(2)}`);
  });
  segments.push('Z');
  return segments.join(' ');
}
