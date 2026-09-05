import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Editor } from 'tldraw';
import type { PanelDTO } from '@comicai/types';
import { usePanelSync } from './use-panel-sync';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: apiMock }));

/*
 * DTO → 캔버스 투영. 여기서 잘못 덮으면 사용자가 방금 한 일이 화면에서 사라지는데,
 * 예외도 오류도 없다.
 *
 * 특히 저장 대기 중인 도형은 건드리면 안 된다 — 그쪽은 서버가 아니라 캔버스가 최신이다.
 * 그 판단은 `useShapeSync.hasUnsaved` 가 하고, 여기서는 그 둘이 실제로 이어져 있는지를 본다.
 */

interface Shape {
  id: string;
  typeName: 'shape';
  type: 'comic-panel';
  x: number;
  y: number;
  props: Record<string, unknown>;
}

type Listener = (entry: {
  changes: { added: object; updated: Record<string, [Shape, Shape]>; removed: object };
}) => void;

function makeCanvas() {
  const shapes = new Map<string, Shape>();
  let listener: Listener | null = null;
  const editor = {
    getCurrentPageShapes: () => [...shapes.values()],
    getShape: (id: string) => shapes.get(id),
    createShape: (s: Partial<Shape> & { id: string }) => {
      shapes.set(s.id, { typeName: 'shape', type: 'comic-panel', x: 0, y: 0, props: {}, ...s });
    },
    updateShape: (s: Partial<Shape> & { id: string }) => {
      const cur = shapes.get(s.id);
      if (cur) shapes.set(s.id, { ...cur, ...s, props: { ...cur.props, ...s.props } });
    },
    deleteShape: (id: string) => shapes.delete(id),
    deleteShapes: (ids: string[]) => ids.forEach((id) => shapes.delete(id)),
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
    /** 사용자가 컷을 옮겼다 = 저장 큐에 들어간다. */
    move(id: string, x: number) {
      const before = shapes.get(id)!;
      const after = { ...before, x };
      shapes.set(id, after);
      listener?.({ changes: { added: {}, updated: { [id]: [before, after] }, removed: {} } });
    },
  };
}

function panelDto(id: string, x: number, y: number): PanelDTO {
  return {
    id,
    pageId: 'page1',
    order: 0,
    shape: {
      type: 'rect',
      points: [
        { x, y },
        { x: x + 100, y },
        { x: x + 100, y: y + 100 },
        { x, y: y + 100 },
      ],
      strokeColor: '#000000',
      strokeWidth: 2,
    },
  } as unknown as PanelDTO;
}

const onPanelsChanged = vi.fn();
const onSavingChange = vi.fn();

function mount(editor: Editor, panels: PanelDTO[]) {
  return renderHook(
    ({ p }: { p: PanelDTO[] }) =>
      usePanelSync({ editor, pageId: 'page1', panels: p, onPanelsChanged, onSavingChange }),
    { initialProps: { p: panels } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
  onPanelsChanged.mockReset();
  onSavingChange.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('usePanelSync — DTO → 캔버스', () => {
  it('서버 목록에 있는 컷을 캔버스에 만든다', () => {
    const canvas = makeCanvas();
    mount(canvas.editor, [panelDto('p1', 0, 0)]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.panelId).toBe('p1');
    expect(shape?.x).toBe(0);
  });

  /*
   * 이것이 이 파일의 이유다.
   *
   * 저장 왕복이 도는 사이에도 서버 목록은 다른 이유로 바뀐다(렌더 상태가 붙는 등).
   * 그때 투영이 아직 못 보낸 편집을 덮으면, 방금 옮긴 컷이 옛 자리로 튀어 돌아가고
   * 다음 저장이 그 옛 좌표를 서버에 굳힌다. 편집이 화면에서도 서버에서도 사라진다.
   */
  it('저장 대기 중인 컷은 서버 목록이 바뀌어도 옛 자리로 되돌리지 않는다', () => {
    const canvas = makeCanvas();
    const dto = panelDto('p1', 0, 0);
    const { rerender } = mount(canvas.editor, [dto]);

    const id = [...canvas.shapes.keys()][0]!;
    canvas.move(id, 300); // 아직 서버에 안 갔다 (디바운스 1.5초)
    expect(canvas.shapes.get(id)?.x).toBe(300);

    // 렌더 상태만 바뀐 (좌표는 아직 옛것인) 목록이 들어온다.
    rerender({ p: [{ ...dto, currentRenderStatus: 'queued' as const }] });

    expect(canvas.shapes.get(id)?.x).toBe(300);
  });
});
