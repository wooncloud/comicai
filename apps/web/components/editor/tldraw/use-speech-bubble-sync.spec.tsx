import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Editor } from 'tldraw';
import type { SpeechBubbleDTO } from '@comicai/types';
import { useSpeechBubbleSync } from './use-speech-bubble-sync';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: apiMock }));

interface Shape {
  id: string;
  typeName: 'shape';
  type: 'speech-bubble';
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
      shapes.set(s.id, { typeName: 'shape', type: 'speech-bubble', x: 0, y: 0, props: {}, ...s });
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

function bubbleDto(id: string, x: number, y: number): SpeechBubbleDTO {
  return {
    id,
    pageId: 'page1',
    order: 0,
    variant: 'ellipse',
    shape: {
      x,
      y,
      w: 120,
      h: 80,
    },
    style: {
      strokeWidth: 2,
      strokeColor: '#000000',
      fillColor: '#ffffff',
    },
    createdAt: '2026-09-21T00:00:00Z',
    updatedAt: '2026-09-21T00:00:00Z',
  };
}

const onBubblesChanged = vi.fn();
const onSavingChange = vi.fn();

function mount(editor: Editor, bubbles: SpeechBubbleDTO[]) {
  return renderHook(
    ({ b }: { b: SpeechBubbleDTO[] }) =>
      useSpeechBubbleSync({
        editor,
        pageId: 'page1',
        bubbles: b,
        onBubblesChanged,
        onSavingChange,
      }),
    { initialProps: { b: bubbles } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
  onBubblesChanged.mockReset();
  onSavingChange.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useSpeechBubbleSync — DTO → 캔버스', () => {
  it('서버 목록에 있는 말풍선을 캔버스에 만든다', () => {
    const canvas = makeCanvas();
    mount(canvas.editor, [bubbleDto('b1', 10, 20)]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.bubbleId).toBe('b1');
    expect(shape?.x).toBe(10);
    expect(shape?.y).toBe(20);
    expect(shape?.props.w).toBe(120);
    expect(shape?.props.h).toBe(80);
    expect(shape?.props.variant).toBe('ellipse');
  });

  it('저장 대기 중인 말풍선은 서버 목록이 바뀌어도 옛 자리로 되돌리지 않는다', () => {
    const canvas = makeCanvas();
    const dto = bubbleDto('b1', 10, 20);
    const { rerender } = mount(canvas.editor, [dto]);

    const id = [...canvas.shapes.keys()][0]!;
    canvas.move(id, 300); // 아직 서버에 안 갔다 (디바운스 1.5초)
    expect(canvas.shapes.get(id)?.x).toBe(300);

    // style 만 바뀐 (좌표는 옛것인) 목록 도착
    rerender({ b: [{ ...dto, style: { ...dto.style, strokeWidth: 4 } }] });

    expect(canvas.shapes.get(id)?.x).toBe(300);
  });

  it('R-6: style 이 누락된 말풍선 DTO 도 기본 스타일로 안전하게 채운다', () => {
    const canvas = makeCanvas();
    const legacyDto: SpeechBubbleDTO = {
      id: 'legacy-b1',
      pageId: 'page1',
      order: 0,
      variant: 'rect',
      shape: { x: 50, y: 50, w: 100, h: 60 },
    } as unknown as SpeechBubbleDTO;

    mount(canvas.editor, [legacyDto]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.bubbleId).toBe('legacy-b1');
    expect(shape?.props.variant).toBe('rect');
    expect(shape?.props.strokeWidth).toBe(2);
    expect(shape?.props.strokeColor).toBe('#000000');
    expect(shape?.props.fillColor).toBe('#ffffff');
  });

  it('DTO 목록에서 빠진 말풍선은 캔버스에서 삭제된다', () => {
    const canvas = makeCanvas();
    const { rerender } = mount(canvas.editor, [bubbleDto('b1', 10, 20), bubbleDto('b2', 30, 40)]);
    expect(canvas.shapes.size).toBe(2);

    rerender({ b: [bubbleDto('b1', 10, 20)] });
    expect(canvas.shapes.size).toBe(1);
    expect([...canvas.shapes.values()][0]?.props.bubbleId).toBe('b1');
  });
});
