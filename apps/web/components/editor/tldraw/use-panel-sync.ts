'use client';
import type { Editor, IndexKey } from 'tldraw';
import {
  ApiPaths,
  normalizePolygonPoints,
  shapeBoundingBox,
  type PanelDTO,
  type PanelShape,
} from '@comicai/types';
import type { ComicPanelShape } from './comic-panel-shape';
import { useShapeSync, type ShapeSyncSpec } from './use-shape-sync';
import type { NormalizedPoint } from './panel-geometry';

interface Args {
  editor: Editor | null;
  pageId: string;
  panels: PanelDTO[];
  onPanelsChanged: (panels: PanelDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

/**
 * 컷(패널) 양방향 동기화.
 *
 * 순방향(캔버스 → 서버)과 역방향(서버 DTO → 캔버스) 모두 `useShapeSync` 공통 엔진이 맡는다.
 * 여기에는 패널 고유의 좌표 변환(`toShape`, `toApiShape`)과 다각형 동등성 비교(`samePolygon`)만 남긴다.
 */
export function usePanelSync({
  editor,
  pageId,
  panels,
  onPanelsChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  useShapeSync<ComicPanelShape, PanelDTO>(SPEC, {
    editor,
    pageId,
    items: panels,
    onItemsChanged: onPanelsChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<ComicPanelShape, PanelDTO> = {
  type: 'comic-panel',
  idProp: 'panelId',
  shapeIdPrefix: 'panel',
  layerRange: ['a1' as IndexKey, 'a2' as IndexKey],
  listPath: ApiPaths.pagePanels,
  itemPath: ApiPaths.panel,
  toBody: (shape) => ({ shape: toApiShape(shape) }),
  toShape: (panel, shape) => {
    const bbox = shapeBoundingBox(panel.shape);
    const status = panel.currentRenderStatus ?? null;
    const imageUrl = panel.currentRenderImageUrl ?? null;
    const variant = panel.shape.type;
    /*
     * 정규화할 수 없는 입력(한 줄로 눌린 폴리곤)이면 `null` 이 온다. 편집기는
     * **직전 모양을 유지한다** — 드래그 중의 일시적 상태일 수 있어서, 모든 점을
     * `{0,0}` 으로 만들면(예전 동작) 도형이 한 점으로 무너진다. 규칙은
     * `@comicai/types` 의 `normalizePolygonPoints` 한 곳에 있다.
     */
    const polygonPoints =
      variant === 'polygon'
        ? (normalizePolygonPoints(panel.shape.points) ?? shape?.props.polygonPoints ?? null)
        : null;
    /*
     * 저장된 shape JSON 은 읽을 때 파싱하지 않는다. strokeColor/strokeWidth 는 Zod
     * 기본값이라 **쓰기 시점에만** 채워지므로, 그 필드가 생기기 전에 만들어진 행에는
     * 없다. 타입은 캐스트가 가려서 있다고 말한다 — `Partial` 로 사실대로 꺼낸다.
     * (같은 이유로 `export.service.ts` 도 여기서 되살린다.)
     */
    const stored = panel.shape as Partial<PanelShape>;
    const strokeColor = stored.strokeColor ?? '#000000';
    const strokeWidth = stored.strokeWidth ?? 2;
    return {
      x: bbox.x,
      y: bbox.y,
      props: {
        w: bbox.w,
        h: bbox.h,
        panelId: panel.id,
        status,
        resultImageUrl: imageUrl,
        variant,
        polygonPoints,
        strokeColor,
        strokeWidth,
      },
    };
  },
  isEqual: (shape, next) =>
    shape.x === next.x &&
    shape.y === next.y &&
    shape.props.w === next.props.w &&
    shape.props.h === next.props.h &&
    shape.props.status === next.props.status &&
    shape.props.resultImageUrl === next.props.resultImageUrl &&
    shape.props.variant === next.props.variant &&
    shape.props.strokeColor === next.props.strokeColor &&
    shape.props.strokeWidth === next.props.strokeWidth &&
    samePolygon(shape.props.polygonPoints, next.props.polygonPoints),
};

function toApiShape(shape: ComicPanelShape): PanelShape {
  const { x, y } = shape;
  const { w, h, variant, polygonPoints, strokeColor, strokeWidth } = shape.props;
  const bboxCorners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const points =
    variant === 'polygon' && polygonPoints && polygonPoints.length >= 3
      ? polygonPoints.map((p) => ({ x: x + p.x * w, y: y + p.y * h }))
      : bboxCorners;
  // 여기 값은 tldraw props 다. shape util 이 기본값을 보장하므로 폴백이 필요 없다 —
  // 서버에서 읽어 온 JSON(위 `stored`)과 헷갈리지 말 것.
  return { type: variant, points, strokeColor, strokeWidth };
}

function samePolygon(a: NormalizedPoint[] | null, b: NormalizedPoint[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((pa, i) => {
    const pb = b[i];
    return pa.x === pb?.x && pa.y === pb.y;
  });
}
