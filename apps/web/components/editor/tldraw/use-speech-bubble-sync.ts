'use client';
import { useEffect } from 'react';
import { type Editor, type TLShapeId, createShapeId } from 'tldraw';
import { api } from '@/lib/api';
import {
  ApiPaths,
  defaultSpeechBubbleStyle,
  flattenTipTapToText,
  textToTipTapDoc,
  type NormalizedPoint,
  type SpeechBubbleDTO,
  type SpeechBubbleShape as ApiBubbleShape,
  type SpeechBubbleStyle,
  type TipTapDoc,
} from '@comicai/types';
import type { SpeechBubbleShape } from './speech-bubble-shape';

const SAVE_DEBOUNCE_MS = 1500;

interface Args {
  editor: Editor | null;
  pageId: string;
  bubbles: SpeechBubbleDTO[];
  onBubblesChanged: (bubbles: SpeechBubbleDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

function flatten(b: SpeechBubbleDTO): SpeechBubbleShape['props'] {
  const style = { ...defaultSpeechBubbleStyle(), ...(b.style ?? {}) };
  return {
    w: Math.max(1, b.shape.w),
    h: Math.max(1, b.shape.h),
    bubbleId: b.id,
    variant: b.variant,
    polygonPoints: b.shape.points ?? null,
    tailX: b.shape.tail?.x ?? null,
    tailY: b.shape.tail?.y ?? null,
    text: flattenTipTapToText(b.text),
    fontSize: style.fontSize,
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
    textAlign: style.textAlign,
  };
}

function toApi(shape: SpeechBubbleShape): {
  variant: SpeechBubbleShape['props']['variant'];
  shape: ApiBubbleShape;
  text: TipTapDoc;
  style: Partial<SpeechBubbleStyle>;
} {
  const { x, y } = shape;
  const {
    w,
    h,
    variant,
    polygonPoints,
    tailX,
    tailY,
    text,
    fontSize,
    strokeWidth,
    strokeColor,
    fillColor,
    textAlign,
  } = shape.props;
  return {
    variant,
    shape: {
      x,
      y,
      w,
      h,
      points:
        variant === 'polygon' && polygonPoints && polygonPoints.length >= 3
          ? polygonPoints
          : undefined,
      tail: tailX !== null && tailY !== null ? { x: tailX, y: tailY } : null,
    },
    text: textToTipTapDoc(text),
    style: { fontSize, strokeWidth, strokeColor, fillColor, textAlign },
  };
}

function samePropsAsDto(shape: SpeechBubbleShape, dto: SpeechBubbleDTO): boolean {
  const next = flatten(dto);
  const cur = shape.props;
  if (
    shape.x !== dto.shape.x ||
    shape.y !== dto.shape.y ||
    cur.w !== next.w ||
    cur.h !== next.h ||
    cur.variant !== next.variant ||
    cur.tailX !== next.tailX ||
    cur.tailY !== next.tailY ||
    cur.text !== next.text ||
    cur.fontSize !== next.fontSize ||
    cur.strokeWidth !== next.strokeWidth ||
    cur.strokeColor !== next.strokeColor ||
    cur.fillColor !== next.fillColor ||
    cur.textAlign !== next.textAlign
  ) {
    return false;
  }
  return samePolygon(cur.polygonPoints, next.polygonPoints);
}

function samePolygon(a: NormalizedPoint[] | null, b: NormalizedPoint[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((pa, i) => pa.x === b[i]?.x && pa.y === b[i].y);
}

export function useSpeechBubbleSync({
  editor,
  pageId,
  bubbles,
  onBubblesChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  // DTO → canvas
  useEffect(() => {
    if (!editor) return;
    const existing = new Map<string, SpeechBubbleShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'speech-bubble') {
        const b = s as SpeechBubbleShape;
        if (b.props.bubbleId) existing.set(b.props.bubbleId, b);
      }
    }
    editor.store.mergeRemoteChanges(() => {
      for (const dto of bubbles) {
        const shape = existing.get(dto.id);
        const props = flatten(dto);
        if (shape) {
          if (!samePropsAsDto(shape, dto)) {
            editor.updateShape<SpeechBubbleShape>({
              id: shape.id,
              type: 'speech-bubble',
              x: dto.shape.x,
              y: dto.shape.y,
              props,
            });
          }
          existing.delete(dto.id);
        } else {
          editor.createShape<SpeechBubbleShape>({
            id: createShapeId(`bubble-${dto.id}`),
            type: 'speech-bubble',
            x: dto.shape.x,
            y: dto.shape.y,
            props,
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, bubbles]);

  // canvas → DTO
  useEffect(() => {
    if (!editor) return;
    const pending = new Map<TLShapeId, SpeechBubbleShape>();
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
        const shape = editor!.getShape<SpeechBubbleShape>(id);
        if (shape) ops.push(createOne(shape));
      }
      for (const [, shape] of pending) {
        if (shape.props.bubbleId) ops.push(patchOne(shape));
      }
      creates.clear();
      pending.clear();
      deletes.clear();
      try {
        await Promise.all(ops);
        if (cancelled) return;
        if (needsRefetch) {
          const list = await api<SpeechBubbleDTO[]>(ApiPaths.pageSpeechBubbles(pageId));
          if (!cancelled) onBubblesChanged(list);
        }
      } catch (err) {
        if (!cancelled) onSaveError?.(err);
      } finally {
        if (!cancelled) onSavingChange(false);
      }
    }

    async function createOne(shape: SpeechBubbleShape) {
      const created = await api<SpeechBubbleDTO>(ApiPaths.pageSpeechBubbles(pageId), {
        method: 'POST',
        body: JSON.stringify(toApi(shape)),
      });
      const live = editor!.getShape<SpeechBubbleShape>(shape.id);
      if (!live) return;
      editor!.store.mergeRemoteChanges(() => {
        editor!.updateShape<SpeechBubbleShape>({
          id: shape.id,
          type: 'speech-bubble',
          props: { ...live.props, bubbleId: created.id },
        });
      });
    }

    async function patchOne(shape: SpeechBubbleShape) {
      if (!shape.props.bubbleId) return;
      await api<SpeechBubbleDTO>(ApiPaths.speechBubble(shape.props.bubbleId), {
        method: 'PATCH',
        body: JSON.stringify(toApi(shape)),
      });
    }

    async function deleteOne(id: string) {
      await api(ApiPaths.speechBubble(id), { method: 'DELETE' });
    }

    const unsubscribe = editor.store.listen(
      (entry) => {
        let dirty = false;
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape' && record.type === 'speech-bubble') {
            creates.add(record.id);
            dirty = true;
          }
        }
        for (const [, after] of Object.values(entry.changes.updated)) {
          if (after.typeName === 'shape' && after.type === 'speech-bubble') {
            const shape = after as SpeechBubbleShape;
            if (creates.has(shape.id)) continue;
            pending.set(shape.id, shape);
            dirty = true;
          }
        }
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === 'shape' && record.type === 'speech-bubble') {
            const shape = record as SpeechBubbleShape;
            if (shape.props.bubbleId) deletes.add(shape.props.bubbleId);
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
  }, [editor, pageId, onBubblesChanged, onSavingChange, onSaveError]);
}
