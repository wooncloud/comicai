'use client';
import { useEffect } from 'react';
import type { Editor, IndexKey } from 'tldraw';
import { shapeId } from './shape-id';
import type { PageFrameShape } from './page-frame-shape';

interface Args {
  editor: Editor | null;
  pageId: string;
  size: { w: number; h: number } | null;
  label: string;
}

/**
 * 페이지 프레임을 캔버스 0,0에 자동 생성/동기화.
 * - locked: 사용자가 클릭/이동/리사이즈 불가.
 * - 항상 z-order 최하: createShape 시 `index: 'a0'` 명시 + 매 effect마다 sendToBack 폴백.
 *   tldraw의 fractional index에서 'a0'은 일반 새 shape보다 작으므로 항상 뒤에 렌더된다.
 * - 크기/라벨 변경 시 삭제 후 재생성 — BaseBoxShape geometry 갱신을 확실히 트리거.
 */
const FRAME_INDEX = 'a0' as IndexKey;

export function usePageFrame({ editor, pageId, size, label }: Args) {
  const w = size?.w;
  const h = size?.h;
  useEffect(() => {
    if (!editor || w == null || h == null) return;
    const frameId = shapeId(`frame-${pageId}`);
    let isNew = false;
    editor.store.mergeRemoteChanges(() => {
      // 캐스트가 필요하다. `getShape` 는 모든 shape 타입의 유니온을 돌려주므로
      // props 에 w/h/label 이 있다고 보장하지 못한다.
      const existing = editor.getShape(frameId) as PageFrameShape | undefined;
      const dimsChanged =
        !existing ||
        existing.props.w !== w ||
        existing.props.h !== h ||
        existing.props.label !== label;
      if (dimsChanged) {
        if (existing) editor.deleteShape(frameId);
        else isNew = true;
        editor.createShape<PageFrameShape>({
          id: frameId,
          type: 'page-frame',
          x: 0,
          y: 0,
          isLocked: true,
          index: FRAME_INDEX,
          props: { w, h, label },
        });
      }
    });
    // sendToBack은 user-op 계열이라 mergeRemoteChanges 밖에서 호출해야 reorder가 반영된다.
    // panel-sync가 새 패널을 위로 쌓아도 매 effect에서 다시 뒤로 보내는 폴백.
    if (editor.getShape(frameId)) editor.sendToBack([frameId]);
    if (isNew) editor.zoomToFit();
  }, [editor, pageId, w, h, label]);
}
