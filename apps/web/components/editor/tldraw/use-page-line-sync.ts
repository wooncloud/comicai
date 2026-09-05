'use client';
import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { shapeId } from './shape-id';
import {
  ApiPaths,
  defaultPageLineStyle,
  type PageLineDTO,
  type PageLineStyle,
} from '@comicai/types';
import type { PageLineShape } from './page-line-shape';
import { useShapeSync, type ShapeSyncSpec } from './use-shape-sync';

interface Args {
  editor: Editor | null;
  pageId: string;
  lines: PageLineDTO[];
  onLinesChanged: (lines: PageLineDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

interface BoxFromPoints {
  x: number;
  y: number;
  props: Pick<PageLineShape['props'], 'w' | 'h' | 'x1Norm' | 'y1Norm' | 'x2Norm' | 'y2Norm'>;
}

function boxFromPoints(x1: number, y1: number, x2: number, y2: number): BoxFromPoints {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.max(1, Math.max(x1, x2) - minX);
  const h = Math.max(1, Math.max(y1, y2) - minY);
  return {
    x: minX,
    y: minY,
    props: {
      w,
      h,
      x1Norm: (x1 - minX) / w,
      y1Norm: (y1 - minY) / h,
      x2Norm: (x2 - minX) / w,
      y2Norm: (y2 - minY) / h,
    },
  };
}

function flatten(l: PageLineDTO): { x: number; y: number; props: PageLineShape['props'] } {
  const style = { ...defaultPageLineStyle(), ...l.style };
  const box = boxFromPoints(l.x1, l.y1, l.x2, l.y2);
  return {
    x: box.x,
    y: box.y,
    props: {
      ...box.props,
      lineId: l.id,
      strokeWidth: style.strokeWidth,
      strokeColor: style.strokeColor,
      strokeStyle: style.strokeStyle,
    },
  };
}

/** 캔버스 shape → DB 좌표(절대 두 점 + style). */
function toApi(shape: PageLineShape): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: Partial<PageLineStyle>;
} {
  const { w, h, x1Norm, y1Norm, x2Norm, y2Norm, strokeWidth, strokeColor, strokeStyle } =
    shape.props;
  return {
    x1: shape.x + x1Norm * w,
    y1: shape.y + y1Norm * h,
    x2: shape.x + x2Norm * w,
    y2: shape.y + y2Norm * h,
    style: { strokeWidth, strokeColor, strokeStyle },
  };
}

function samePropsAsDto(shape: PageLineShape, dto: PageLineDTO): boolean {
  const next = flatten(dto);
  const cur = shape.props;
  return (
    shape.x === next.x &&
    shape.y === next.y &&
    cur.w === next.props.w &&
    cur.h === next.props.h &&
    cur.x1Norm === next.props.x1Norm &&
    cur.y1Norm === next.props.y1Norm &&
    cur.x2Norm === next.props.x2Norm &&
    cur.y2Norm === next.props.y2Norm &&
    cur.strokeWidth === next.props.strokeWidth &&
    cur.strokeColor === next.props.strokeColor &&
    cur.strokeStyle === next.props.strokeStyle
  );
}

export function usePageLineSync({
  editor,
  pageId,
  lines,
  onLinesChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  // 역방향 투영보다 **먼저** 불러야 한다 — 아래 이펙트가 이 훅의 `hasUnsaved` 를 읽는다.
  const sync = useShapeSync<PageLineShape, PageLineDTO>(SPEC, {
    editor,
    pageId,
    onItemsChanged: onLinesChanged,
    onSavingChange,
    onSaveError,
  });

  // DTO → canvas
  useEffect(() => {
    if (!editor) return;
    const existing = new Map<string, PageLineShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'page-line') {
        const l = s as PageLineShape;
        if (l.props.lineId) existing.set(l.props.lineId, l);
      }
    }
    editor.store.mergeRemoteChanges(() => {
      for (const dto of lines) {
        const shape = existing.get(dto.id);
        /*
         * 저장 대기 중인 도형은 건너뛴다 — 그쪽은 서버가 아니라 캔버스가 최신이다.
         * 없으면 왕복이 도는 사이의 편집이 재조회에 덮여 사라진다. 이유 전체는
         * `useShapeSync` 의 §"왕복 중의 편집" 에 있다.
         */
        if (sync.hasUnsaved(dto.id)) {
          existing.delete(dto.id);
          continue;
        }
        const next = flatten(dto);
        if (shape) {
          if (!samePropsAsDto(shape, dto)) {
            editor.updateShape<PageLineShape>({
              id: shape.id,
              type: 'page-line',
              x: next.x,
              y: next.y,
              props: next.props,
            });
          }
          existing.delete(dto.id);
        } else {
          editor.createShape<PageLineShape>({
            id: shapeId(`pline-${dto.id}`),
            type: 'page-line',
            x: next.x,
            y: next.y,
            props: next.props,
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, lines, sync]);
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<PageLineShape> = {
  type: 'page-line',
  idProp: 'lineId',
  listPath: ApiPaths.pagePageLines,
  itemPath: ApiPaths.pageLine,
  toBody: toApi,
};
