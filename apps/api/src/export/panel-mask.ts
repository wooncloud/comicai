import { normalizePolygonPoints, panelShapePath, type PanelShape } from '@comicai/types';
import { safeColor, svgDocument } from './svg';

/**
 * 패널 모양에 맞는 알파 마스크 SVG.
 * sharp `dest-in`는 src의 ALPHA로 dest를 잘라낸다 — 배경 rect가 있으면 alpha=1이
 * 통과되어 마스킹이 무효가 되므로 path만 그리고 외부는 SVG 기본 alpha=0.
 */
export function buildPanelMaskSvg(shape: PanelShape, w: number, h: number): Buffer {
  const normalized =
    shape.type === 'polygon' ? (normalizePolygonPoints(shape.points) ?? []) : undefined;
  const path = panelShapePath(shape.type, w, h, normalized);
  return svgDocument(w, h, `<path d="${path}" fill="white"/>`);
}

/**
 * 패널 모양 외곽선만 그리는 SVG. 합성 시 마스킹된 이미지 위에 overlay한다.
 * 화면 내부는 fill=none, stroke만. stroke 두께가 두꺼우면 패스 안쪽으로만 보이도록
 * 동일 path로 clip-path를 적용해 외곽으로 번지지 않게 한다.
 */
export function buildPanelStrokeSvg(
  shape: PanelShape,
  w: number,
  h: number,
  strokeColor: string,
  strokeWidth: number,
): Buffer | null {
  if (strokeWidth <= 0) return null;
  const normalized =
    shape.type === 'polygon' ? (normalizePolygonPoints(shape.points) ?? []) : undefined;
  const path = panelShapePath(shape.type, w, h, normalized);
  // clipPath 로 stroke 가 패널 바깥으로 번지는 것을 막는다(외곽선이 패널 안쪽에서만 그려짐).
  return svgDocument(
    w,
    h,
    `<defs><clipPath id="c"><path d="${path}"/></clipPath></defs>` +
      `<path d="${path}" fill="none" stroke="${safeColor(strokeColor, '#000000')}" stroke-width="${strokeWidth * 2}" stroke-linejoin="round" clip-path="url(#c)"/>`,
  );
}
