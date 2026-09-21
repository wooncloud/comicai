import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Editor } from 'tldraw';
import type { PageTextDTO } from '@comicai/types';
import { usePageTextSync } from './use-page-text-sync';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: apiMock }));

interface Shape {
  id: string;
  typeName: 'shape';
  type: 'page-text';
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
      shapes.set(s.id, { typeName: 'shape', type: 'page-text', x: 0, y: 0, props: {}, ...s });
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
    move(id: string, x: number) {
      const before = shapes.get(id)!;
      const after = { ...before, x };
      shapes.set(id, after);
      listener?.({ changes: { added: {}, updated: { [id]: [before, after] }, removed: {} } });
    },
  };
}

function textDto(id: string, x: number, y: number, text: string): PageTextDTO {
  return {
    id,
    pageId: 'page1',
    order: 0,
    x,
    y,
    w: 150,
    h: 50,
    text,
    style: {
      fontSize: 24,
      fontFamily: 'sans-serif',
      color: '#111111',
      textAlign: 'left',
    },
    createdAt: '2026-09-21T00:00:00Z',
    updatedAt: '2026-09-21T00:00:00Z',
  };
}

const onTextsChanged = vi.fn();
const onSavingChange = vi.fn();

function mount(editor: Editor, texts: PageTextDTO[]) {
  return renderHook(
    ({ t }: { t: PageTextDTO[] }) =>
      usePageTextSync({ editor, pageId: 'page1', texts: t, onTextsChanged, onSavingChange }),
    { initialProps: { t: texts } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
  onTextsChanged.mockReset();
  onSavingChange.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('usePageTextSync — DTO → 캔버스', () => {
  it('서버 목록에 있는 텍스트를 캔버스에 만든다', () => {
    const canvas = makeCanvas();
    mount(canvas.editor, [textDto('t1', 15, 25, '안녕')]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.textId).toBe('t1');
    expect(shape?.x).toBe(15);
    expect(shape?.y).toBe(25);
    expect(shape?.props.text).toBe('안녕');
    expect(shape?.props.fontSize).toBe(24);
    expect(shape?.props.fontFamily).toBe('sans-serif');
  });

  it('저장 대기 중인 텍스트는 서버 목록이 바뀌어도 옛 자리로 되돌리지 않는다', () => {
    const canvas = makeCanvas();
    const dto = textDto('t1', 15, 25, '안녕');
    const { rerender } = mount(canvas.editor, [dto]);

    const id = [...canvas.shapes.keys()][0]!;
    canvas.move(id, 400); // 아직 서버에 안 갔다 (디바운스 1.5초)
    expect(canvas.shapes.get(id)?.x).toBe(400);

    // text 만 바뀐 목록 도착
    rerender({ t: [{ ...dto, text: '서버 변경' }] });

    expect(canvas.shapes.get(id)?.x).toBe(400);
  });

  it('R-6: style 이 누락된 텍스트 DTO 도 기본 스타일로 안전하게 채운다', () => {
    const canvas = makeCanvas();
    const legacyDto: PageTextDTO = {
      id: 'legacy-t1',
      pageId: 'page1',
      order: 0,
      x: 30,
      y: 40,
      w: 100,
      h: 40,
      text: '레거시',
    } as unknown as PageTextDTO;

    mount(canvas.editor, [legacyDto]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.textId).toBe('legacy-t1');
    expect(shape?.props.fontSize).toBe(24);
    expect(shape?.props.fontFamily).toBe('sans-serif');
    expect(shape?.props.color).toBe('#111111');
    expect(shape?.props.textAlign).toBe('left');
  });

  it('DTO 목록에서 빠진 텍스트는 캔버스에서 삭제된다', () => {
    const canvas = makeCanvas();
    const { rerender } = mount(canvas.editor, [
      textDto('t1', 10, 10, 'A'),
      textDto('t2', 20, 20, 'B'),
    ]);
    expect(canvas.shapes.size).toBe(2);

    rerender({ t: [textDto('t1', 10, 10, 'A')] });
    expect(canvas.shapes.size).toBe(1);
    expect([...canvas.shapes.values()][0]?.props.textId).toBe('t1');
  });
});
