'use client';
import { useEffect } from 'react';
import { type Editor, type TLShapeId, createShapeId } from 'tldraw';
import { api } from '@/lib/api';
import {
  ApiPaths,
  defaultPageLineStyle,
  type PageLineDTO,
  type PageLineStyle,
} from '@comicai/types';
import type { PageLineShape } from './page-line-shape';

const SAVE_DEBOUNCE_MS = 1500;

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
  const style = { ...defaultPageLineStyle(), ...(l.style ?? {}) };
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
            id: createShapeId(`pline-${dto.id}`),
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
  }, [editor, lines]);

  // canvas → DTO
  useEffect(() => {
    if (!editor) return;
    const pending = new Map<TLShapeId, PageLineShape>();
    const creates = new Set<TLShapeId>();
    const deletes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function schedule() {
      onSavingChange(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    }

    async function flush() {
      timer = null;
      const ops: Promise<void>[] = [];
      const needsRefetch = creates.size > 0;
      for (const id of deletes) ops.push(deleteOne(id));
      for (const id of creates) {
        const shape = editor!.getShape<PageLineShape>(id);
        if (shape) ops.push(createOne(shape));
      }
      for (const [, shape] of pending) {
        if (shape.props.lineId) ops.push(patchOne(shape));
      }
      creates.clear();
      pending.clear();
      deletes.clear();
      try {
        await Promise.all(ops);
        if (cancelled) return;
        if (needsRefetch) {
          const list = await api<PageLineDTO[]>(ApiPaths.pagePageLines(pageId));
          if (!cancelled) onLinesChanged(list);
        }
      } catch (err) {
        if (!cancelled) onSaveError?.(err);
      } finally {
        if (!cancelled) onSavingChange(false);
      }
    }

    async function createOne(shape: PageLineShape) {
      const created = await api<PageLineDTO>(ApiPaths.pagePageLines(pageId), {
        method: 'POST',
        body: JSON.stringify(toApi(shape)),
      });
      const live = editor!.getShape<PageLineShape>(shape.id);
      if (!live) return;
      editor!.store.mergeRemoteChanges(() => {
        editor!.updateShape<PageLineShape>({
          id: shape.id,
          type: 'page-line',
          props: { ...live.props, lineId: created.id },
        });
      });
    }

    async function patchOne(shape: PageLineShape) {
      if (!shape.props.lineId) return;
      await api<PageLineDTO>(ApiPaths.pageLine(shape.props.lineId), {
        method: 'PATCH',
        body: JSON.stringify(toApi(shape)),
      });
    }

    async function deleteOne(id: string) {
      await api(ApiPaths.pageLine(id), { method: 'DELETE' });
    }

    const unsubscribe = editor.store.listen(
      (entry) => {
        let dirty = false;
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape' && record.type === 'page-line') {
            creates.add(record.id);
            dirty = true;
          }
        }
        for (const [, after] of Object.values(entry.changes.updated)) {
          if (after.typeName === 'shape' && after.type === 'page-line') {
            const shape = after as PageLineShape;
            if (creates.has(shape.id)) continue;
            pending.set(shape.id, shape);
            dirty = true;
          }
        }
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === 'shape' && record.type === 'page-line') {
            const shape = record as PageLineShape;
            if (shape.props.lineId) deletes.add(shape.props.lineId);
            creates.delete(shape.id);
            pending.delete(shape.id);
            dirty = true;
          }
        }
        if (dirty) schedule();
      },
      { source: 'user', scope: 'document' },
    );

    return () => {
      cancelled = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [editor, pageId, onLinesChanged, onSavingChange, onSaveError]);
}
