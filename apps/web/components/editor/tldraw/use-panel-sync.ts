'use client';
import { useEffect, useRef } from 'react';
import { type Editor, type TLShapeId, createShapeId } from 'tldraw';
import { api } from '@/lib/api';
import { ApiPaths, type PanelDTO, type PanelShape } from '@comicai/types';
import type { ComicPanelShape } from './comic-panel-shape';

const SAVE_DEBOUNCE_MS = 1500;

interface Args {
  editor: Editor | null;
  pageId: string;
  panels: PanelDTO[];
  onPanelsChanged: (panels: PanelDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
}

/**
 * 양방향 동기화:
 *  - panels prop이 바뀌면 캔버스의 ComicPanel shape 집합을 재구성.
 *  - 캔버스에서 사용자가 shape를 추가/이동/리사이즈/삭제하면 1.5초 디바운스 후 API 호출.
 */
export function usePanelSync({ editor, pageId, panels, onPanelsChanged, onSavingChange }: Args) {
  const ignoreNextEditorChange = useRef(false);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  // panels → shapes 동기화 (서버 → 캔버스).
  useEffect(() => {
    if (!editor) return;
    ignoreNextEditorChange.current = true;
    const existing = new Map<string, ComicPanelShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'comic-panel') {
        const p = s as ComicPanelShape;
        if (p.props.panelId) existing.set(p.props.panelId, p);
      }
    }
    editor.run(() => {
      for (const panel of panels) {
        const bbox = boundingBox(panel.shape);
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
              resultImageUrl: null, // 결과 이미지는 별도 fetch — 추후 P5-7에서 통합
            },
          } satisfies Partial<ComicPanelShape> & { id: TLShapeId; type: 'comic-panel' });
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
      // 서버에 없는 panel shape은 캔버스에서 제거.
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, panels]);

  // shapes → panels 동기화 (캔버스 → 서버, 1.5s debounce).
  useEffect(() => {
    if (!editor) return;
    const pending = new Map<TLShapeId, ComicPanelShape>();
    const creates = new Set<TLShapeId>();
    const deletes = new Set<string>(); // panelId
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      onSavingChange(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    }

    async function flush() {
      timer = null;
      const ops: Promise<void>[] = [];
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
      } finally {
        onSavingChange(false);
        // refresh panels from server to get authoritative state
        const list = await api<PanelDTO[]>(ApiPaths.pagePanels(pageId));
        onPanelsChanged(list);
      }
    }

    async function createPanel(shape: ComicPanelShape) {
      const created = await api<PanelDTO>(ApiPaths.pagePanels(pageId), {
        method: 'POST',
        body: JSON.stringify({ shape: toApiShape(shape) }),
      });
      editor!.updateShape({
        id: shape.id,
        type: 'comic-panel',
        props: { ...shape.props, panelId: created.id },
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
        if (ignoreNextEditorChange.current) {
          ignoreNextEditorChange.current = false;
          return;
        }
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
            if (creates.has(shape.id)) continue; // 새로 만든 건 create로 처리
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
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
    // pageId/editor 단위로만 재구독.
  }, [editor, pageId, onPanelsChanged, onSavingChange]);
}

function boundingBox(shape: PanelShape): { x: number; y: number; w: number; h: number } {
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function toApiShape(shape: ComicPanelShape): PanelShape {
  const { x, y } = shape;
  const w = shape.props.w;
  const h = shape.props.h;
  return {
    type: 'rect',
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    strokeColor: '#0f172a',
    strokeWidth: 2,
  };
}
