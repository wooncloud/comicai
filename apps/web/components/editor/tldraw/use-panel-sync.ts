'use client';
import { useEffect } from 'react';
import { type Editor, type TLShapeId, createShapeId } from 'tldraw';
import { api } from '@/lib/api';
import { ApiPaths, shapeBoundingBox, type PanelDTO, type PanelShape } from '@comicai/types';
import type { ComicPanelShape } from './comic-panel-shape';

const SAVE_DEBOUNCE_MS = 1500;

interface Args {
  editor: Editor | null;
  pageId: string;
  panels: PanelDTO[];
  onPanelsChanged: (panels: PanelDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

/**
 * 양방향 동기화:
 *  - panels prop이 바뀌면 캔버스의 ComicPanel shape 집합을 재구성.
 *    → `mergeRemoteChanges`로 감싸 store listener의 'user' 필터에 잡히지 않게 함.
 *  - 캔버스에서 사용자가 shape를 추가/이동/리사이즈/삭제하면 1.5초 디바운스 후 API 호출.
 *  - flush 후 refetch는 새로 만든(creates) shape에 ID 할당이 필요할 때만.
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
        if (shape) {
          editor.updateShape({
            id: shape.id,
            type: 'comic-panel',
            x: bbox.x,
            y: bbox.y,
            props: {
              w: bbox.w,
              h: bbox.h,
              panelId: panel.id,
              status: panel.currentRenderStatus ?? null,
              resultImageUrl: null,
            },
          });
          existing.delete(panel.id);
        } else {
          editor.createShape<ComicPanelShape>({
            id: createShapeId(`panel-${panel.id}`),
            type: 'comic-panel',
            x: bbox.x,
            y: bbox.y,
            props: {
              w: bbox.w,
              h: bbox.h,
              panelId: panel.id,
              status: panel.currentRenderStatus ?? null,
              resultImageUrl: null,
            },
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, panels]);

  useEffect(() => {
    if (!editor) return;
    const pending = new Map<TLShapeId, ComicPanelShape>();
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
      const needsIdAssignment = creates.size > 0;
      for (const sid of deletes) ops.push(deletePanel(sid));
      for (const id of creates) {
        const shape = editor!.getShape(id) as ComicPanelShape | undefined;
        if (shape) ops.push(createPanel(shape));
      }
      for (const [, shape] of pending) {
        if (shape.props.panelId) ops.push(patchPanel(shape));
      }
      creates.clear();
      pending.clear();
      deletes.clear();
      try {
        await Promise.all(ops);
        if (cancelled) return;
        if (needsIdAssignment) {
          const list = await api<PanelDTO[]>(ApiPaths.pagePanels(pageId));
          if (!cancelled) onPanelsChanged(list);
        }
      } catch (err) {
        if (!cancelled) onSaveError?.(err);
      } finally {
        if (!cancelled) onSavingChange(false);
      }
    }

    async function createPanel(shape: ComicPanelShape) {
      const created = await api<PanelDTO>(ApiPaths.pagePanels(pageId), {
        method: 'POST',
        body: JSON.stringify({ shape: toApiShape(shape) }),
      });
      const live = editor!.getShape(shape.id);
      if (!live) return; // 생성 직후 사용자가 삭제한 경우.
      editor!.store.mergeRemoteChanges(() => {
        editor!.updateShape({
          id: shape.id,
          type: 'comic-panel',
          props: { ...(live as ComicPanelShape).props, panelId: created.id },
        });
      });
    }

    async function patchPanel(shape: ComicPanelShape) {
      if (!shape.props.panelId) return;
      await api<PanelDTO>(ApiPaths.panel(shape.props.panelId), {
        method: 'PATCH',
        body: JSON.stringify({ shape: toApiShape(shape) }),
      });
    }

    async function deletePanel(panelId: string) {
      await api(ApiPaths.panel(panelId), { method: 'DELETE' });
    }

    const unsubscribe = editor.store.listen(
      (entry) => {
        let dirty = false;
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape' && record.type === 'comic-panel') {
            creates.add(record.id as TLShapeId);
            dirty = true;
          }
        }
        for (const [, after] of Object.values(entry.changes.updated)) {
          if (after.typeName === 'shape' && after.type === 'comic-panel') {
            const shape = after as ComicPanelShape;
            if (creates.has(shape.id)) continue;
            pending.set(shape.id, shape);
            dirty = true;
          }
        }
        for (const record of Object.values(entry.changes.removed)) {
          if (record.typeName === 'shape' && record.type === 'comic-panel') {
            const shape = record as ComicPanelShape;
            if (shape.props.panelId) deletes.add(shape.props.panelId);
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
  }, [editor, pageId, onPanelsChanged, onSavingChange, onSaveError]);
}

function toApiShape(shape: ComicPanelShape): PanelShape {
  const { x, y } = shape;
  const { w, h } = shape.props;
  return {
    type: 'rect',
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    strokeColor: '#000000',
    strokeWidth: 2,
  };
}
