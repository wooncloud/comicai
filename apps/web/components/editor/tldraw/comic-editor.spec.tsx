import { describe, expect, it, vi } from 'vitest';
import type { Editor, TLShape, TLShapeId, TLUiActionItem } from 'tldraw';
import { setupLayerEnforcement } from './comic-editor';
import type { LayerOrderAction } from '@/lib/use-layer-reorder';

type Listener = (entry: {
  changes: {
    added: Record<string, TLShape>;
    updated: Record<string, [TLShape, TLShape]>;
    removed: Record<string, TLShape>;
  };
}) => void;

function createMockEditor(initialShapes: TLShape[] = []) {
  const shapes = new Map<TLShapeId, TLShape>(initialShapes.map((s) => [s.id, s]));
  let listener: Listener | null = null;
  let selectedShapes: TLShape[] = [];

  let nextIndex = 6;
  const bringToFront = vi.fn((ids: TLShapeId[]) => {
    for (const id of ids) {
      const s = shapes.get(id);
      if (s) {
        shapes.set(id, { ...s, index: `a${nextIndex++}` as TLShape['index'] });
      }
    }
  });

  const editor = {
    getCurrentPageShapes: () => [...shapes.values()],
    getSelectedShapes: () => selectedShapes,
    bringToFront,
    store: {
      listen: (cb: Listener) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
      mergeRemoteChanges: (fn: () => void) => fn(),
    },
  } as unknown as Editor;

  return {
    editor,
    shapes,
    bringToFront,
    setSelectedShapes(s: TLShape[]) {
      selectedShapes = s;
    },
    emit(changes: {
      added?: Record<string, TLShape>;
      updated?: Record<string, [TLShape, TLShape]>;
      removed?: Record<string, TLShape>;
    }) {
      listener?.({
        changes: {
          added: changes.added ?? {},
          updated: changes.updated ?? {},
          removed: changes.removed ?? {},
        },
      });
    },
  };
}

describe('comic-editor — 층 강제 리스너 (setupLayerEnforcement)', () => {
  it('서버에서 온 말풍선이 있는 상태에서 컷 추가 → 컷이 아래로 배치된다', async () => {
    // 서버에서 역방향 투영으로 들어온 말풍선 (index: a2)
    const serverBubble: TLShape = {
      id: 'shape:bub1' as TLShapeId,
      typeName: 'shape',
      type: 'speech-bubble',
      x: 10,
      y: 10,
      index: 'a2' as TLShape['index'],
      props: {},
    } as TLShape;

    const mock = createMockEditor([serverBubble]);
    const unsubscribe = setupLayerEnforcement(mock.editor);

    // 사용자가 컷 도구로 새 컷 생성 (tldraw 기본 동작으로 index 가 맨 위 a5 로 들어옴)
    const userPanel: TLShape = {
      id: 'shape:panel1' as TLShapeId,
      typeName: 'shape',
      type: 'comic-panel',
      x: 0,
      y: 0,
      index: 'a5' as TLShape['index'],
      props: {},
    } as TLShape;
    mock.shapes.set(userPanel.id, userPanel);

    // 사용자 추가 이벤트 발송
    mock.emit({
      added: { [userPanel.id]: userPanel },
    });

    // queueMicrotask 실행 대기
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    // 말풍선이 컷 위로 올라가도록 bringToFront 가 호출되어야 함
    expect(mock.bringToFront).toHaveBeenCalledWith(['shape:bub1']);

    const updatedBubble = mock.shapes.get('shape:bub1' as TLShapeId)!;
    const currentPanel = mock.shapes.get('shape:panel1' as TLShapeId)!;

    // 말풍선 index 가 컷 index 보다 커야 함 (컷이 아래)
    expect(updatedBubble.index > currentPanel.index).toBe(true);

    unsubscribe();
  });

  it('드래그처럼 index 가 안 바뀌는 갱신에는 bringToFront 를 부르지 않는다', async () => {
    const bubble: TLShape = {
      id: 'shape:bub1' as TLShapeId,
      typeName: 'shape',
      type: 'speech-bubble',
      x: 10,
      y: 10,
      index: 'a3' as TLShape['index'],
      props: {},
    } as TLShape;
    const panel: TLShape = {
      id: 'shape:panel1' as TLShapeId,
      typeName: 'shape',
      type: 'comic-panel',
      x: 0,
      y: 0,
      index: 'a2' as TLShape['index'],
      props: {},
    } as TLShape;

    const mock = createMockEditor([panel, bubble]);
    const unsubscribe = setupLayerEnforcement(mock.editor);

    // 사용자가 도형을 드래그하여 x 좌표만 바뀜 (index 동일)
    const draggedPanel: TLShape = { ...panel, x: 50 };
    mock.shapes.set(panel.id, draggedPanel);

    mock.emit({
      updated: { [panel.id]: [panel, draggedPanel] },
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    // 드래그에는 bringToFront 가 호출되지 않아야 함
    expect(mock.bringToFront).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('도형의 index 가 바뀐 갱신에는 bringToFront 가 호출된다', async () => {
    const bubble: TLShape = {
      id: 'shape:bub1' as TLShapeId,
      typeName: 'shape',
      type: 'speech-bubble',
      x: 10,
      y: 10,
      index: 'a3' as TLShape['index'],
      props: {},
    } as TLShape;
    const panel: TLShape = {
      id: 'shape:panel1' as TLShapeId,
      typeName: 'shape',
      type: 'comic-panel',
      x: 0,
      y: 0,
      index: 'a2' as TLShape['index'],
      props: {},
    } as TLShape;

    const mock = createMockEditor([panel, bubble]);
    const unsubscribe = setupLayerEnforcement(mock.editor);

    // 패널의 index 가 a4 로 바뀜 (말풍선보다 위로 튀어오름)
    const reindexedPanel: TLShape = { ...panel, index: 'a4' as TLShape['index'] };
    mock.shapes.set(panel.id, reindexedPanel);

    mock.emit({
      updated: { [panel.id]: [panel, reindexedPanel] },
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    // index 변경에는 층 계층 복원을 위해 bringToFront 가 호출되어야 함
    expect(mock.bringToFront).toHaveBeenCalledWith(['shape:bub1']);

    unsubscribe();
  });
});

describe('comic-editor — 컷 순서 단축키 차단 (actions override)', () => {
  function setupActions(editor: Editor, onReorderAction?: (action: LayerOrderAction) => boolean) {
    const baseActionBringToFront = vi.fn();
    const baseActionBringForward = vi.fn();
    const baseActions: Record<string, TLUiActionItem> = {
      'bring-to-front': { id: 'bring-to-front', label: 'Front', onSelect: baseActionBringToFront },
      'bring-forward': { id: 'bring-forward', label: 'Forward', onSelect: baseActionBringForward },
      'send-backward': { id: 'send-backward', label: 'Backward', onSelect: vi.fn() },
      'send-to-back': { id: 'send-to-back', label: 'Back', onSelect: vi.fn() },
    };

    const next = { ...baseActions };
    const override = (id: string, actionKey: LayerOrderAction) => {
      const base = next[id];
      if (base) {
        next[id] = {
          ...base,
          onSelect(source) {
            const selected = editor.getSelectedShapes();
            if (selected.some((s) => s.type === 'comic-panel')) {
              return;
            }
            if (onReorderAction?.(actionKey)) return;
            void base.onSelect(source);
          },
        };
      }
    };
    override('bring-to-front', 'toFront');
    override('bring-forward', 'forward');
    override('send-backward', 'backward');
    override('send-to-back', 'toBack');

    return { next, baseActionBringToFront, baseActionBringForward };
  }

  it('컷 선택 + 순서 동작 → reorder 호출 없음, base 액션 차단으로 층 유지', () => {
    const panel: TLShape = {
      id: 'shape:panel1' as TLShapeId,
      typeName: 'shape',
      type: 'comic-panel',
      x: 0,
      y: 0,
      index: 'a1' as TLShape['index'],
      props: {},
    } as TLShape;
    const bubble: TLShape = {
      id: 'shape:bub1' as TLShapeId,
      typeName: 'shape',
      type: 'speech-bubble',
      x: 10,
      y: 10,
      index: 'a2' as TLShape['index'],
      props: {},
    } as TLShape;

    const mock = createMockEditor([panel, bubble]);
    // 컷을 선택 상태로 설정
    mock.setSelectedShapes([panel]);

    const onReorderAction = vi.fn();
    const { next, baseActionBringToFront, baseActionBringForward } = setupActions(
      mock.editor,
      onReorderAction,
    );

    // 컷이 선택된 상태에서 'bring-to-front' 단축키/액션 호출
    next['bring-to-front']!.onSelect('menu');

    // 컷은 reorder API 호출이 없고, tldraw 기본 onSelect 도 호출되지 않아야 함
    expect(onReorderAction).not.toHaveBeenCalled();
    expect(baseActionBringToFront).not.toHaveBeenCalled();

    // 'bring-forward' 호출
    next['bring-forward']!.onSelect('menu');
    expect(onReorderAction).not.toHaveBeenCalled();
    expect(baseActionBringForward).not.toHaveBeenCalled();

    // 컷(a1)이 여전히 말풍선(a2)보다 아래 (층 유지)
    expect(panel.index < bubble.index).toBe(true);
  });

  it('말풍선 선택 + 순서 동작 → onReorderAction 정상 호출 및 base 액션 방지', () => {
    const bubble: TLShape = {
      id: 'shape:bub1' as TLShapeId,
      typeName: 'shape',
      type: 'speech-bubble',
      x: 10,
      y: 10,
      index: 'a2' as TLShape['index'],
      props: {},
    } as TLShape;

    const mock = createMockEditor([bubble]);
    mock.setSelectedShapes([bubble]);

    const onReorderAction = vi.fn().mockReturnValue(true);
    const { next, baseActionBringToFront } = setupActions(mock.editor, onReorderAction);

    next['bring-to-front']!.onSelect('menu');

    // 말풍선은 onReorderAction 이 호출되고, base 액션은 방지됨
    expect(onReorderAction).toHaveBeenCalledWith('toFront');
    expect(baseActionBringToFront).not.toHaveBeenCalled();
  });
});
