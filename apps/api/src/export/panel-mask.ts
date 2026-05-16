import { panelShapePath, shapeBoundingBox, type PanelShape } from '@comicai/types';

/**
 * 패널 모양에 맞는 알파 마스크 SVG.
 * sharp `dest-in`는 src의 ALPHA로 dest를 잘라낸다 — 배경 rect가 있으면 alpha=1이
 * 통과되어 마스킹이 무효가 되므로 path만 그리고 외부는 SVG 기본 alpha=0.
 */
export function buildPanelMaskSvg(shape: PanelShape, w: number, h: number): Buffer {
  const normalized = shape.type === 'polygon' ? localizedPolygonPoints(shape) : undefined;
  const path = panelShapePath(shape.type, w, h, normalized);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="white"/></svg>`;
  return Buffer.from(svg);
}

/** 절대 좌표 polygon points를 자신의 bbox 기준 정규화([0..1])로 변환. */
function localizedPolygonPoints(shape: PanelShape): { x: number; y: number }[] {
  const bbox = shapeBoundingBox(shape);
  if (bbox.w === 0 || bbox.h === 0) return [];
  return shape.points.map((p) => ({
    x: (p.x - bbox.x) / bbox.w,
    y: (p.y - bbox.y) / bbox.h,
  }));
}
