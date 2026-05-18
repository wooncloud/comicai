'use client';
import { useEffect } from 'react';
import { type Editor, type TLShapeId, createShapeId } from 'tldraw';
import { api } from '@/lib/api';
import {
  ApiPaths,
  defaultPageTextStyle,
  type PageTextDTO,
  type PageTextStyle,
} from '@comicai/types';
import type { PageTextShape } from './page-text-shape';

const SAVE_DEBOUNCE_MS = 1500;

interface Args {
  editor: Editor | null;
  pageId: string;
  texts: PageTextDTO[];
  onTextsChanged: (texts: PageTextDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

function flatten(t: PageTextDTO): PageTextShape['props'] {
  const style = { ...defaultPageTextStyle(), ...(t.style ?? {}) };
  return {
    w: Math.max(1, t.w),
    h: Math.max(1, t.h),
    textId: t.id,
    text: t.text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    color: style.color,
    textAlign: style.textAlign,
  };
}

function toApi(shape: PageTextShape): {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: Partial<PageTextStyle>;
} {
  const { x, y } = shape;
  const { w, h, text, fontSize, fontFamily, color, textAlign } = shape.props;
  return {
    x,
    y,
    w,
    h,
    text,
    style: { fontSize, fontFamily, color, textAlign },
  };
}

function samePropsAsDto(shape: PageTextShape, dto: PageTextDTO): boolean {
  const next = flatten(dto);
  const cur = shape.props;
  return (
    shape.x === dto.x &&
    shape.y === dto.y &&
    cur.w === next.w &&
    cur.h === next.h &&
    cur.text === next.text &&
    cur.fontSize === next.fontSize &&
    cur.fontFamily === next.fontFamily &&
    cur.color === next.color &&
    cur.textAlign === next.textAlign
  );
}

export function usePageTextSync({
  editor,
  pageId,
  texts,
  onTextsChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  // DTO → canvas
  useEffect(() => {
    if (!editor) return;
    const existing = new Map<string, PageTextShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'page-text') {
        const t = s as PageTextShape;
        if (t.props.textId) existing.set(t.props.textId, t);
      }
    }
    editor.store.mergeRemoteChanges(() => {
      for (const dto of texts) {
        const shape = existing.get(dto.id);
        const props = flatten(dto);
        if (shape) {
          if (!samePropsAsDto(shape, dto)) {
            editor.updateShape<PageTextShape>({
              id: shape.id,
              type: 'page-text',
              x: dto.x,
              y: dto.y,
              props,
            });
          }
          existing.delete(dto.id);
        } else {
          editor.createShape<PageTextShape>({
            id: createShapeId(`ptext-${dto.id}`),
            type: 'page-text',
            x: dto.x,
            y: dto.y,
            props,
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, texts]);

  // canvas → DTO
  useEffect(() => {
    if (!editor) return;
    const pending = new Map<TLShapeId, PageTextShape>();
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
        const shape = editor!.getShape<PageTextShape>(id);
        if (shape) ops.push(createOne(shape));
      }
      for (const [, shape] of pending) {
        if (shape.props.textId) ops.push(patchOne(shape));
      }
      creates.clear();
      pending.clear();
      deletes.clear();
      try {
        await Promise.all(ops);
        if (cancelled) return;
        if (needsRefetch) {
          const list = await api<PageTextDTO[]>(ApiPaths.pagePageTexts(pageId));
          if (!cancelled) onTextsChanged(list);
        }
      } catch (err) {
        if (!cancelled) onSaveError?.(err);
      } finally {
        if (!cancelled) onSavingChange(false);
      }
    }

    async function createOne(shape: PageTextShape) {
      const created = await api<PageTextDTO>(ApiPaths.pagePageTexts(pageId), {
        method: 'POST',
        body: JSON.stringify(toApi(shape)),
      });
      const live = editor!.getShape<PageTextShape>(shape.id);
      if (!live) return;
      editor!.store.mergeRemoteChanges(() => {
        editor!.updateShape<PageTextShape>({
          id: shape.id,
          type: 'page-text',
          props: { ...live.props, textId: created.id },
        });
      });
    }

    async function patchOne(shape: PageTextShape) {
      if (!shape.props.textId) return;
      await api<PageTextDTO>(ApiPaths.pageText(shape.props.textId), {
        method: 'PATCH',
        body: JSON.stringify(toApi(shape)),
      });
    }

    async function deleteOne(id: string) {
      await api(ApiPaths.pageText(id), { method: 'DELETE' });
    }

    const unsubscribe = editor.store.listen(
      (entry) => {
        let dirty = false;
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape' && record.type === 'page-text') {
            creates.add(record.id);
            dirty = true;
          }
        }
        for (const [, after] of Object.values(entry.changes.updated)) {
          if (after.typeName === 'shape' && after.type === 'page-text') {
            const shape = after as PageTextShape;
            if (creates.has(shape.id)) continue;
            pending.set(shape.id, shape);
            dirty = true;
          }
        }
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === 'shape' && record.type === 'page-text') {
            const shape = record as PageTextShape;
            if (shape.props.textId) deletes.add(shape.props.textId);
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
  }, [editor, pageId, onTextsChanged, onSavingChange, onSaveError]);
}
