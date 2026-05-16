import type { PanelShape, PanelShapeType } from '@comicai/types';

const ROUND_RADIUS = 14;

/**
 * 패널 모양에 맞는 알파 마스크 SVG. 흰색=불투명, 검정=투명.
 * sharp.composite의 `dest-in`/`dest-out` 블렌드에 사용.
 */
export function buildPanelMaskSvg(shape: PanelShape, w: number, h: number): Buffer {
  const path = svgPathFor(shape, w, h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="black"/><path d="${path}" fill="white"/></svg>`;
  return Buffer.from(svg);
}

function svgPathFor(shape: PanelShape, w: number, h: number): string {
  const type = shape.type as PanelShapeType;
  switch (type) {
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
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    case 'parallelogram':
      return `M ${0.18 * w} 0 L ${w} 0 L ${0.82 * w} ${h} L 0 ${h} Z`;
    case 'polygon': {
      if (shape.points.length < 3) return `M 0 0 H ${w} V ${h} H 0 Z`;
      const bbox = polygonBbox(shape.points);
      if (!bbox) return `M 0 0 H ${w} V ${h} H 0 Z`;
      // 백엔드 points는 절대 좌표. 패널 캔버스(w,h) 내부 좌표로 평행이동.
      const segments: string[] = [];
      shape.points.forEach((p, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        segments.push(`${cmd} ${(p.x - bbox.x).toFixed(2)} ${(p.y - bbox.y).toFixed(2)}`);
      });
      segments.push('Z');
      return segments.join(' ');
    }
  }
}

function polygonBbox(
  points: { x: number; y: number }[],
): { x: number; y: number; w: number; h: number } | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
