'use client';
import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { shapeId } from './shape-id';
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
  // 역방향 투영보다 **먼저** 불러야 한다 — 아래 이펙트가 이 훅의 `hasUnsaved` 를 읽는다.
  const sync = useShapeSync<ComicPanelShape, PanelDTO>(SPEC, {
    editor,
    pageId,
    onItemsChanged: onPanelsChanged,
    onSavingChange,
    onSaveError,
  });

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
        /*
         * 저장 대기 중인 도형은 건너뛴다 — 그쪽은 서버가 아니라 캔버스가 최신이다.
         * 없으면 왕복이 도는 사이의 편집이 재조회에 덮여 사라진다. 이유 전체는
         * `useShapeSync` 의 §"왕복 중의 편집" 에 있다.
         */
        if (sync.hasUnsaved(panel.id)) {
          existing.delete(panel.id);
          continue;
        }
        const bbox = shapeBoundingBox(panel.shape);
        const shape = existing.get(panel.id);
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
  }, [editor, panels, sync]);
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<ComicPanelShape> = {
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
