'use client';
import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { shapeId } from './shape-id';
import {
  ApiPaths,
  shapeBoundingBox,
  type PanelDTO,
  type PanelShape,
  type PanelShapeType,
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
 * 양방향 동기화 중 **DTO → 캔버스** 쪽.
 *
 * `panels` prop 이 바뀌면 ComicPanel shape 집합을 재구성한다. `mergeRemoteChanges` 로
 * 감싸는 이유는, 그러지 않으면 이 갱신이 store 리스너의 `'user'` 필터에 잡혀
 * "사용자가 방금 고쳤다" 로 읽히고 곧바로 서버에 되쓰이기 때문이다.
 *
 * 반대 방향(캔버스 → 서버)은 `useShapeSync` 가 맡는다 — 네 종류 shape 이 같은 코드를
 * 쓴다. 디바운스·재시도·이탈 시 저장이 전부 거기 있다.
 */
export function usePanelSync({
  editor,
  pageId,
  panels,
  onPanelsChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  useEffect(() => {
    if (!editor) return;
    const existing = new Map<string, ComicPanelShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'comic-panel') {
        const p = s as ComicPanelShape;
        if (p.props.panelId) existing.set(p.props.panelId, p);
      }
    }
    editor.store.mergeRemoteChanges(() => {
      for (const panel of panels) {
        const bbox = shapeBoundingBox(panel.shape);
        const shape = existing.get(panel.id);
        const status = panel.currentRenderStatus ?? null;
        const imageUrl = panel.currentRenderImageUrl ?? null;
        const variant = panel.shape.type;
        const polygonPoints =
          variant === 'polygon' ? normalizePolygonPoints(panel.shape.points, bbox) : null;
        const strokeColor = panel.shape.strokeColor ?? '#000000';
        const strokeWidth = panel.shape.strokeWidth ?? 2;
        if (shape) {
          const unchanged =
            shape.x === bbox.x &&
            shape.y === bbox.y &&
            shape.props.w === bbox.w &&
            shape.props.h === bbox.h &&
            shape.props.status === status &&
            shape.props.resultImageUrl === imageUrl &&
            shape.props.variant === variant &&
            shape.props.strokeColor === strokeColor &&
            shape.props.strokeWidth === strokeWidth &&
            samePolygon(shape.props.polygonPoints, polygonPoints);
          if (!unchanged) {
            editor.updateShape({
              id: shape.id,
              type: 'comic-panel',
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
            });
          }
          existing.delete(panel.id);
        } else {
          editor.createShape<ComicPanelShape>({
            id: shapeId(`panel-${panel.id}`),
            type: 'comic-panel',
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
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, panels]);

  useShapeSync<ComicPanelShape, PanelDTO>(SPEC, {
    editor,
    pageId,
    onItemsChanged: onPanelsChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<ComicPanelShape, PanelDTO> = {
  type: 'comic-panel',
  idProp: 'panelId',
  listPath: ApiPaths.pagePanels,
  itemPath: ApiPaths.panel,
  toBody: (shape) => ({ shape: toApiShape(shape) }),
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
  return {
    type: variant,
    points,
    strokeColor: strokeColor ?? '#000000',
    strokeWidth: strokeWidth ?? 2,
  };
}

function normalizePolygonPoints(
  points: { x: number; y: number }[],
  bbox: { x: number; y: number; w: number; h: number },
): NormalizedPoint[] {
  if (bbox.w === 0 || bbox.h === 0) return points.map(() => ({ x: 0, y: 0 }));
  return points.map((p) => ({
    x: (p.x - bbox.x) / bbox.w,
    y: (p.y - bbox.y) / bbox.h,
  }));
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
