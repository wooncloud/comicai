'use client';
import type { Editor, IndexKey } from 'tldraw';
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

function samePropsAsDto(
  shape: PageLineShape,
  next: { x: number; y: number; props: PageLineShape['props'] },
): boolean {
  const cur = shape.props;
  const n = next.props;
  return (
    shape.x === next.x &&
    shape.y === next.y &&
    cur.w === n.w &&
    cur.h === n.h &&
    cur.x1Norm === n.x1Norm &&
    cur.y1Norm === n.y1Norm &&
    cur.x2Norm === n.x2Norm &&
    cur.y2Norm === n.y2Norm &&
    cur.strokeWidth === n.strokeWidth &&
    cur.strokeColor === n.strokeColor &&
    cur.strokeStyle === n.strokeStyle
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
  useShapeSync<PageLineShape, PageLineDTO>(SPEC, {
    editor,
    pageId,
    items: lines,
    onItemsChanged: onLinesChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<PageLineShape, PageLineDTO> = {
  type: 'page-line',
  idProp: 'lineId',
  shapeIdPrefix: 'pline',
  layerRange: ['a4' as IndexKey, 'a5' as IndexKey],
  listPath: ApiPaths.pagePageLines,
  itemPath: ApiPaths.pageLine,
  toBody: toApi,
  toShape: (dto) => flatten(dto),
  isEqual: samePropsAsDto,
};
