import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Editor } from 'tldraw';
import type { PageLineDTO } from '@comicai/types';
import { usePageLineSync } from './use-page-line-sync';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: apiMock }));

interface Shape {
  id: string;
  typeName: 'shape';
  type: 'page-line';
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
      shapes.set(s.id, { typeName: 'shape', type: 'page-line', x: 0, y: 0, props: {}, ...s });
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

function lineDto(id: string, x1: number, y1: number, x2: number, y2: number): PageLineDTO {
  return {
    id,
    pageId: 'page1',
    order: 0,
    x1,
    y1,
    x2,
    y2,
    style: {
      strokeWidth: 3,
      strokeColor: '#222222',
      strokeStyle: 'dashed',
    },
    createdAt: '2026-09-21T00:00:00Z',
    updatedAt: '2026-09-21T00:00:00Z',
  };
}

const onLinesChanged = vi.fn();
const onSavingChange = vi.fn();

function mount(editor: Editor, lines: PageLineDTO[]) {
  return renderHook(
    ({ l }: { l: PageLineDTO[] }) =>
      usePageLineSync({ editor, pageId: 'page1', lines: l, onLinesChanged, onSavingChange }),
    { initialProps: { l: lines } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
  onLinesChanged.mockReset();
  onSavingChange.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('usePageLineSync — DTO → 캔버스', () => {
  it('서버 목록에 있는 직선을 캔버스에 만든다 (boxFromPoints 좌표 정규화 확인)', () => {
    const canvas = makeCanvas();
    mount(canvas.editor, [lineDto('l1', 10, 20, 110, 220)]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.lineId).toBe('l1');
    expect(shape?.x).toBe(10);
    expect(shape?.y).toBe(20);
    expect(shape?.props.w).toBe(100);
    expect(shape?.props.h).toBe(200);
    expect(shape?.props.x1Norm).toBe(0);
    expect(shape?.props.y1Norm).toBe(0);
    expect(shape?.props.x2Norm).toBe(1);
    expect(shape?.props.y2Norm).toBe(1);
    expect(shape?.props.strokeWidth).toBe(3);
    expect(shape?.props.strokeColor).toBe('#222222');
    expect(shape?.props.strokeStyle).toBe('dashed');
  });

  it('저장 대기 중인 직선은 서버 목록이 바뀌어도 옛 자리로 되돌리지 않는다', () => {
    const canvas = makeCanvas();
    const dto = lineDto('l1', 10, 20, 110, 220);
    const { rerender } = mount(canvas.editor, [dto]);

    const id = [...canvas.shapes.keys()][0]!;
    canvas.move(id, 500); // 아직 서버에 안 갔다 (디바운스 1.5초)
    expect(canvas.shapes.get(id)?.x).toBe(500);

    // style 만 바뀐 목록 도착
    rerender({ l: [{ ...dto, style: { ...dto.style, strokeWidth: 5 } }] });

    expect(canvas.shapes.get(id)?.x).toBe(500);
  });

  it('R-6: style 이 누락된 직선 DTO 도 기본 스타일로 안전하게 채운다', () => {
    const canvas = makeCanvas();
    const legacyDto: PageLineDTO = {
      id: 'legacy-l1',
      pageId: 'page1',
      order: 0,
      x1: 5,
      y1: 5,
      x2: 50,
      y2: 50,
    } as unknown as PageLineDTO;

    mount(canvas.editor, [legacyDto]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.lineId).toBe('legacy-l1');
    expect(shape?.props.strokeWidth).toBe(2);
    expect(shape?.props.strokeColor).toBe('#111111');
    expect(shape?.props.strokeStyle).toBe('solid');
  });

  it('DTO 목록에서 빠진 직선은 캔버스에서 삭제된다', () => {
    const canvas = makeCanvas();
    const { rerender } = mount(canvas.editor, [
      lineDto('l1', 10, 20, 110, 220),
      lineDto('l2', 30, 40, 130, 240),
    ]);
    expect(canvas.shapes.size).toBe(2);

    rerender({ l: [lineDto('l1', 10, 20, 110, 220)] });
    expect(canvas.shapes.size).toBe(1);
    expect([...canvas.shapes.values()][0]?.props.lineId).toBe('l1');
  });

  it('수평선 또는 수직선(폭 또는 높이가 0)인 경우 w, h가 최소 1로 보정된다', () => {
    const canvas = makeCanvas();
    mount(canvas.editor, [lineDto('l-flat', 10, 50, 110, 50)]);
    const shape = [...canvas.shapes.values()][0];
    expect(shape?.props.w).toBe(100);
    expect(shape?.props.h).toBe(1);
  });
});
