import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Editor, IndexKey, TLShape } from 'tldraw';
import { useShapeSync, type ShapeSyncSpec } from './use-shape-sync';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: apiMock }));

/*
 * 이 훅의 결함은 전부 조용하다 — 예외도 없고 콘솔도 깨끗하고, 화면에는 "저장됨" 이라고
 * 뜬다. 잃은 편집은 새로고침해야 드러난다. 그래서 회귀해도 아무도 모른다.
 *
 * 아래 다섯 개는 전부 "왕복이 도는 사이에 사용자가 뭘 했는가" 다. 실제 tldraw 대신
 * 최소 스텁을 쓰는데, 이 훅이 editor 에게 묻는 것은 네 가지(getShape·updateShape·
 * deleteShapes·store.listen)뿐이고 그 이상을 흉내 내면 테스트가 tldraw 버전에 묶인다.
 */

interface TestShape {
  id: string;
  typeName: 'shape';
  type: string;
  x: number;
  y: number;
  index?: string;
  props: { srvId: string | null; [key: string]: unknown };
}
interface Dto {
  id: string;
  x: number;
  order?: number;
}

type Listener = (entry: {
  changes: {
    added: Record<string, TestShape>;
    updated: Record<string, [TestShape, TestShape]>;
    removed: Record<string, TestShape>;
  };
}) => void;

function makeCanvas() {
  const shapes = new Map<string, TestShape>();
  let listener: Listener | null = null;
  let inMergeRemote = false;

  const mergeRemoteChanges = vi.fn((fn: () => void) => {
    inMergeRemote = true;
    try {
      fn();
    } finally {
      inMergeRemote = false;
    }
  });

  const createShape = vi.fn(
    (s: {
      id: string;
      type?: string;
      x?: number;
      y?: number;
      index?: string;
      props?: Record<string, unknown>;
    }) => {
      shapes.set(s.id, {
        id: s.id,
        typeName: 'shape',
        type: s.type ?? 'test-shape',
        x: s.x ?? 0,
        y: s.y ?? 0,
        index: s.index,
        props: { srvId: null, ...s.props },
      });
    },
  );

  const updateShape = vi.fn(
    (partial: { id: string; x?: number; y?: number; props?: Record<string, unknown> }) => {
      const cur = shapes.get(partial.id);
      if (cur) {
        shapes.set(partial.id, {
          ...cur,
          ...partial,
          props: { ...cur.props, ...partial.props },
        });
      }
    },
  );

  const deleteShape = vi.fn((id: string) => {
    shapes.delete(id);
  });

  const deleteShapes = vi.fn((ids: string[]) => {
    ids.forEach((id) => shapes.delete(id));
  });

  const editor = {
    getCurrentPageShapes: () => [...shapes.values()],
    getShape: (id: string) => shapes.get(id),
    createShape,
    updateShape,
    deleteShape,
    deleteShapes,
    store: {
      listen: (cb: Listener) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
      mergeRemoteChanges,
    },
  } as unknown as Editor;

  const empty = { added: {}, updated: {}, removed: {} };
  return {
    editor,
    shapes,
    createShape,
    updateShape,
    deleteShape,
    deleteShapes,
    mergeRemoteChanges,
    isInMergeRemote: () => inMergeRemote,
    /** 서버에서 투영돼 온 도형. 리스너를 거치지 않으므로 저장 큐에 들어가지 않는다. */
    seed(
      id: string,
      x: number,
      srvId: string,
      extraProps?: Record<string, unknown>,
      index?: string,
    ) {
      shapes.set(id, {
        id,
        typeName: 'shape',
        type: 'test-shape',
        x,
        y: 0,
        index,
        props: { srvId, ...extraProps },
      });
    },
    /** 사용자가 도형을 만들었다. */
    add(id: string, x: number, srvId: string | null = null) {
      const shape: TestShape = {
        id,
        typeName: 'shape',
        type: 'test-shape',
        x,
        y: 0,
        props: { srvId },
      };
      shapes.set(id, shape);
      listener?.({ changes: { ...empty, added: { [id]: shape } } });
    },
    /** 사용자가 도형을 옮겼다. */
    move(id: string, x: number) {
      const before = shapes.get(id)!;
      const after = { ...before, x };
      shapes.set(id, after);
      listener?.({ changes: { ...empty, updated: { [id]: [before, after] } } });
    },
    /** 사용자가 도형을 지웠다. */
    remove(id: string) {
      const shape = shapes.get(id)!;
      shapes.delete(id);
      listener?.({ changes: { ...empty, removed: { [id]: shape } } });
    },
  };
}

const SPEC = {
  type: 'test-shape',
  idProp: 'srvId',
  shapeIdPrefix: 'test',
  listPath: (pageId: string) => `/pages/${pageId}/items`,
  itemPath: (id: string) => `/items/${id}`,
  toBody: (shape: TestShape) => ({ x: shape.x }),
  toShape: (dto: Dto) => ({
    x: dto.x,
    y: 0,
    props: { srvId: dto.id },
  }),
} as unknown as ShapeSyncSpec<TLShape, Dto>;

// 이펙트 의존성에 들어가므로 렌더마다 같은 참조여야 한다.
const onItemsChanged = vi.fn();
const onSavingChange = vi.fn();
const onSaveError = vi.fn();

function mount(editor: Editor, items?: Dto[]) {
  return renderHook(
    ({ currentItems }: { currentItems?: Dto[] } = {}) =>
      useShapeSync<TLShape, Dto>(SPEC, {
        editor,
        pageId: 'page1',
        items: currentItems,
        onItemsChanged,
        onSavingChange,
        onSaveError,
      }),
    { initialProps: { currentItems: items } },
  );
}

/** `api` 호출을 (method, path) 로 요약한다. */
function calls(): [string, string][] {
  return apiMock.mock.calls.map(([path, init]) => [
    (init as RequestInit | undefined)?.method ?? 'GET',
    path as string,
  ]);
}

/** 다음에 도착할 응답을 손으로 쥔다 — "왕복이 도는 동안" 을 만들기 위해. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DEBOUNCE = 1500;

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.mockReset();
  apiMock.mockResolvedValue([]);
  onItemsChanged.mockReset();
  onSavingChange.mockReset();
  onSaveError.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useShapeSync — 왕복 중의 편집', () => {
  /*
   * 지우는 시점에 서버 id 가 없으면 DELETE 를 큐에 넣을 수 없다. 예전에는 거기서 끝나서
   * 서버에 임자 없는 행이 남았고, 곧이어 도는 재조회가 그 행으로 도형을 **되살렸다**.
   * 사용자가 방금 지운 것이 돌아온다.
   */
  it('생성 응답을 기다리는 사이에 지우면 서버 행도 지운다', async () => {
    const canvas = makeCanvas();
    const post = deferred<Dto>();
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return post.promise;
      return Promise.resolve([]);
    });

    mount(canvas.editor);
    canvas.add('s1', 10);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(calls()).toEqual([['POST', '/pages/page1/items']]);

    canvas.remove('s1');
    post.resolve({ id: 'srv1', x: 10 });
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    expect(calls()).toContainEqual(['DELETE', '/items/srv1']);
  });

  /*
   * 저장 배지는 왕복이 끝나면 "저장됨" 으로 돌아갔다 — 큐에 아직 보낼 것이 남아 있어도.
   * 이 훅의 결함이 전부 조용한 이유가 그거다. 사용자는 배지를 보고 창을 닫는다.
   */
  it('아직 보낼 것이 남았으면 저장됐다고 하지 않는다', async () => {
    const canvas = makeCanvas();
    const post = deferred<Dto>();
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return post.promise;
      return Promise.resolve([]);
    });

    mount(canvas.editor);
    canvas.add('s1', 10);
    await vi.advanceTimersByTimeAsync(DEBOUNCE); // POST 왕복 시작

    canvas.move('s1', 99); // 왕복 중에 옮겼다 = 아직 보낼 것이 남았다
    onSavingChange.mockClear();
    post.resolve({ id: 'srv1', x: 10 });
    await vi.advanceTimersByTimeAsync(0); // 왕복 종료 — 여기서 "저장됨" 이라고 하면 거짓말

    expect(onSavingChange).not.toHaveBeenCalledWith(false);

    // 그리고 남은 편집은 실제로 나간다.
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(calls()).toContainEqual(['PATCH', '/items/srv1']);
  });

  /*
   * 부모가 들고 있는 목록은 PATCH 뒤에 저절로 갱신되지 않는다. 예전에는 생성이 있을
   * 때만 다시 읽어서, 옮겨 저장한 좌표가 그 목록에 영영 반영되지 않았다. 그 낡은 목록이
   * 다른 이유로 한 번 더 바뀌면(렌더 상태가 붙는 등) 투영이 컷을 옛 자리로 되돌린다.
   */
  it('생성이 없는 저장 뒤에도 서버 목록을 다시 읽는다', async () => {
    const canvas = makeCanvas();
    apiMock.mockResolvedValue([]);
    mount(canvas.editor);

    canvas.seed('s1', 10, 'srv1');
    canvas.move('s1', 99);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    expect(calls()).toEqual([
      ['PATCH', '/items/srv1'],
      ['GET', '/pages/page1/items'],
    ]);
    expect(onItemsChanged).toHaveBeenCalledWith([]);
  });

  /*
   * 재조회는 캔버스를 서버 상태로 덮어쓴다. 저장 대기 중인 도형까지 덮으면 방금 한
   * 편집이 사라지므로, 역방향 투영이 건너뛸 수 있게 알려 준다.
   */
  it('저장 대기 중인 서버 id 를 hasUnsaved 로 알린다', async () => {
    const canvas = makeCanvas();
    apiMock.mockResolvedValue([]);
    const { result } = mount(canvas.editor);

    canvas.add('s1', 10, 'srv1'); // 이미 저장된 도형이 있다
    canvas.move('s1', 20);
    expect(result.current.hasUnsaved('srv1')).toBe(true);
    expect(result.current.hasUnsaved('other')).toBe(false);

    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(result.current.hasUnsaved('srv1')).toBe(false);

    // 삭제도 "아직 서버에 못 보낸 상태" 다 — 재조회가 도형을 되살리면 안 된다.
    canvas.remove('s1');
    expect(result.current.hasUnsaved('srv1')).toBe(true);
  });

  /*
   * 재시도를 다 쓰면 캔버스를 서버 상태로 되돌린다. 예전에는 그때 큐를 **통째로** 비웠는데,
   * 마지막 왕복이 도는 사이에 들어온 편집은 한 번도 시도된 적이 없다. 실패한 적도 없는
   * 편집이 실패한 편집과 함께 버려졌고, 화면은 그대로라 아무도 모른다.
   */
  it('마지막 왕복 중에 들어온, 시도된 적 없는 편집은 버리지 않는다', async () => {
    const canvas = makeCanvas();
    /** srvA 의 PATCH 응답을 회차마다 손에 쥔다 — 왕복이 도는 순간을 만들기 위해. */
    const inFlightA: ReturnType<typeof deferred<unknown>>[] = [];
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && path === '/items/srvA') {
        const d = deferred<unknown>();
        inFlightA.push(d);
        return d.promise;
      }
      return Promise.resolve([]);
    });

    mount(canvas.editor);
    canvas.seed('a', 1, 'srvA');
    canvas.seed('b', 1, 'srvB');
    canvas.move('a', 2);

    // 1회차 + 재시도 3회(2000/4000/8000). 네 번째가 실패하면 포기한다.
    const settleAttempt = async (advance: number, index: number) => {
      await vi.advanceTimersByTimeAsync(advance);
      inFlightA[index]!.reject(new Error('500'));
      await vi.advanceTimersByTimeAsync(0);
    };
    await settleAttempt(DEBOUNCE, 0);
    await settleAttempt(2000, 1);
    await settleAttempt(4000, 2);

    await vi.advanceTimersByTimeAsync(8000); // 마지막 회차가 도는 중
    canvas.move('b', 50); // ← 이 편집은 한 번도 시도된 적이 없다
    inFlightA[3]!.reject(new Error('500'));
    await vi.advanceTimersByTimeAsync(0); // 포기 + 서버 상태 재조회

    expect(onSaveError).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(calls()).toContainEqual(['PATCH', '/items/srvB']);
  });

  /*
   * 생성이 끝내 실패하면 그 도형은 서버 id 가 없다. 재조회는 서버 id 로 짝을 맞추므로
   * 그 도형을 지우지 못하고, 이후 편집은 PATCH 할 대상이 없어 영영 저장되지 않는다 —
   * 화면에는 "저장됨" 이라고 뜬 채로. 새로고침 한 번이면 어차피 사라질 도형이다.
   */
  it('끝내 만들지 못한 도형은 캔버스에서 지운다', async () => {
    const canvas = makeCanvas();
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('500'));
      return Promise.resolve([]);
    });

    mount(canvas.editor);
    canvas.add('s1', 10);
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(canvas.shapes.has('s1')).toBe(true);

    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);

    expect(canvas.shapes.has('s1')).toBe(false);
    expect(onSaveError).toHaveBeenCalled();
  });
});

describe('useShapeSync — DTO → 캔버스 역방향 투영', () => {
  it('서버 DTO 목록을 캔버스 도형으로 생성한다', () => {
    const canvas = makeCanvas();
    mount(canvas.editor, [
      { id: 'srv1', x: 10 },
      { id: 'srv2', x: 20 },
    ]);

    expect(canvas.shapes.size).toBe(2);
    const s1 = canvas.shapes.get('shape:test-srv1');
    const s2 = canvas.shapes.get('shape:test-srv2');
    expect(s1?.x).toBe(10);
    expect(s1?.props.srvId).toBe('srv1');
    expect(s2?.x).toBe(20);
    expect(s2?.props.srvId).toBe('srv2');
  });

  it('DTO 변경 시 기존 도형을 in-place 갱신하고, 동일하면 갱신하지 않는다', () => {
    const canvas = makeCanvas();
    const { rerender } = mount(canvas.editor, [{ id: 'srv1', x: 10 }]);

    expect(canvas.updateShape).not.toHaveBeenCalled();

    // DTO 좌표 변경
    rerender({ currentItems: [{ id: 'srv1', x: 50 }] });
    expect(canvas.updateShape).toHaveBeenCalledTimes(1);
    expect(canvas.shapes.get('shape:test-srv1')?.x).toBe(50);

    // 동일한 DTO 로 리렌더 시 불필요한 updateShape 가 호출되지 않는다
    canvas.updateShape.mockClear();
    rerender({ currentItems: [{ id: 'srv1', x: 50 }] });
    expect(canvas.updateShape).not.toHaveBeenCalled();
  });

  it('DTO 목록에서 빠진 고아 도형은 캔버스에서 삭제한다', () => {
    const canvas = makeCanvas();
    const { rerender } = mount(canvas.editor, [
      { id: 'srv1', x: 10 },
      { id: 'srv2', x: 20 },
    ]);
    expect(canvas.shapes.size).toBe(2);

    // srv2 가 목록에서 제외됨
    rerender({ currentItems: [{ id: 'srv1', x: 10 }] });
    expect(canvas.shapes.has('shape:test-srv1')).toBe(true);
    expect(canvas.shapes.has('shape:test-srv2')).toBe(false);
    expect(canvas.deleteShape).toHaveBeenCalledWith('shape:test-srv2');
  });

  it('R-2: 역방향 투영의 모든 캔버스 조작은 mergeRemoteChanges 안에서 일어난다', () => {
    const canvas = makeCanvas();
    let wasInMergeRemoteOnCreate = false;
    canvas.createShape.mockImplementation(
      (s: { id: string; x?: number; y?: number; props?: Record<string, unknown> }) => {
        wasInMergeRemoteOnCreate = canvas.isInMergeRemote();
        canvas.shapes.set(s.id, {
          id: s.id,
          typeName: 'shape',
          type: 'test-shape',
          x: s.x ?? 0,
          y: s.y ?? 0,
          props: { srvId: null, ...s.props },
        });
      },
    );

    mount(canvas.editor, [{ id: 'srv1', x: 10 }]);
    expect(canvas.mergeRemoteChanges).toHaveBeenCalled();
    expect(wasInMergeRemoteOnCreate).toBe(true);
  });

  it('R-3: 서버 id가 아직 없는 로컬 신규 도형은 DTO 투영 시 고아로 지워지지 않는다', () => {
    const canvas = makeCanvas();
    // 사용자가 방금 만든 도형 (서버 ID 없음)
    canvas.add('local-pending', 5, null);

    const { rerender } = mount(canvas.editor, [{ id: 'srv1', x: 10 }]);
    expect(canvas.shapes.has('local-pending')).toBe(true);
    expect(canvas.shapes.has('shape:test-srv1')).toBe(true);

    // DTO 목록이 갱신되어도 로컬 신규 도형은 유지된다
    rerender({ currentItems: [{ id: 'srv1', x: 20 }] });
    expect(canvas.shapes.has('local-pending')).toBe(true);
  });

  it('R-4: hasUnsaved 로 건너뛴 로컬 수정 도형은 DTO 목록에 없어도 고아로 삭제되지 않는다', () => {
    const canvas = makeCanvas();
    canvas.seed('s1', 10, 'srv1');

    const { rerender } = mount(canvas.editor, [{ id: 'srv1', x: 10 }]);
    canvas.move('s1', 99); // 저장 대기 중 (hasUnsaved = true)

    // srv1 이 누락된 새 서버 목록이 들어온다 (예: 다른 페이지 쿼리 결과 등)
    rerender({ currentItems: [{ id: 'srv2', x: 20 }] });

    // srv1 은 hasUnsaved 상태이므로 고아 삭제 대상에서 제외되고 캔버스에 살아있어야 한다
    expect(canvas.shapes.has('s1')).toBe(true);
    expect(canvas.shapes.get('s1')?.x).toBe(99);
    expect(canvas.shapes.has('shape:test-srv2')).toBe(true);
  });

  it('R-8: updateShape 시 DTO 에 없는 기존 shape.props(클라이언트 속성)가 보존된다', () => {
    const canvas = makeCanvas();
    // s1 에 클라이언트 전용 추가 속성이 들어있음
    canvas.seed('shape:test-srv1', 10, 'srv1', { clientOnlyFlag: true, customNote: 'local' });

    const { rerender } = mount(canvas.editor, [{ id: 'srv1', x: 10 }]);
    // DTO 좌표가 바뀌어 updateShape 발생
    rerender({ currentItems: [{ id: 'srv1', x: 30 }] });

    const updated = canvas.shapes.get('shape:test-srv1')!;
    expect(updated.x).toBe(30);
    expect(updated.props.srvId).toBe('srv1');
    expect(updated.props.clientOnlyFlag).toBe(true);
    expect(updated.props.customNote).toBe('local');
  });

  it('T-03: DTO order 대로 캔버스 z 순서(index)가 오름차순으로 복원된다', () => {
    const canvas = makeCanvas();
    const customSpec: ShapeSyncSpec<TLShape, Dto> = {
      ...SPEC,
      layerRange: ['a2' as IndexKey, 'a3' as IndexKey],
    };

    renderHook(
      ({ currentItems }: { currentItems: Dto[] }) =>
        useShapeSync(customSpec, {
          editor: canvas.editor,
          pageId: 'page-1',
          items: currentItems,
          onItemsChanged: vi.fn(),
          onSavingChange: vi.fn(),
        }),
      {
        initialProps: {
          currentItems: [
            { id: 'b2', x: 20, order: 1 },
            { id: 'b1', x: 10, order: 0 },
            { id: 'b3', x: 30, order: 2 },
          ],
        },
      },
    );

    const s1 = canvas.shapes.get('shape:test-b1')!;
    const s2 = canvas.shapes.get('shape:test-b2')!;
    const s3 = canvas.shapes.get('shape:test-b3')!;

    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s3).toBeDefined();

    // order 0 < order 1 < order 2 순서대로 index가 오름차순이어야 함
    expect(s1.index! < s2.index!).toBe(true);
    expect(s2.index! < s3.index!).toBe(true);
  });

  it('T-03: layerRange 대역을 준수하여 종류 간 층(말풍선 < 텍스트)이 유지된다', () => {
    const canvas = makeCanvas();
    const bubbleSpec: ShapeSyncSpec<TLShape, Dto> = {
      ...SPEC,
      type: 'test-bubble',
      shapeIdPrefix: 'bubble',
      layerRange: ['a2' as IndexKey, 'a3' as IndexKey],
    };
    const textSpec: ShapeSyncSpec<TLShape, Dto> = {
      ...SPEC,
      type: 'test-text',
      shapeIdPrefix: 'text',
      layerRange: ['a3' as IndexKey, 'a4' as IndexKey],
    };

    // 말풍선 2개 생성
    renderHook(() =>
      useShapeSync(bubbleSpec, {
        editor: canvas.editor,
        pageId: 'page-1',
        items: [
          { id: 'bub1', x: 0, order: 0 },
          { id: 'bub2', x: 10, order: 1 },
        ],
        onItemsChanged: vi.fn(),
        onSavingChange: vi.fn(),
      }),
    );

    // 텍스트 2개 생성
    renderHook(() =>
      useShapeSync(textSpec, {
        editor: canvas.editor,
        pageId: 'page-1',
        items: [
          { id: 'txt1', x: 0, order: 0 },
          { id: 'txt2', x: 10, order: 1 },
        ],
        onItemsChanged: vi.fn(),
        onSavingChange: vi.fn(),
      }),
    );

    const bub1 = canvas.shapes.get('shape:bubble-bub1')!;
    const bub2 = canvas.shapes.get('shape:bubble-bub2')!;
    const txt1 = canvas.shapes.get('shape:text-txt1')!;
    const txt2 = canvas.shapes.get('shape:text-txt2')!;

    // 말풍선 대역 검증 ('a2' < bubble < 'a3')
    expect(bub1.index! > 'a2' && bub1.index! < 'a3').toBe(true);
    expect(bub2.index! > 'a2' && bub2.index! < 'a3').toBe(true);

    // 텍스트 대역 검증 ('a3' < text < 'a4')
    expect(txt1.index! > 'a3' && txt1.index! < 'a4').toBe(true);
    expect(txt2.index! > 'a3' && txt2.index! < 'a4').toBe(true);

    // 모든 말풍선 < 모든 텍스트 (종류 간 층 보장)
    expect(bub1.index! < txt1.index!).toBe(true);
    expect(bub2.index! < txt1.index!).toBe(true);
    expect(bub2.index! < txt2.index!).toBe(true);
  });

  it('T-03: DTO order 가 변경된 새 목록이 들어오면 updateShape 로 index 가 갱신된다', () => {
    const canvas = makeCanvas();
    const customSpec: ShapeSyncSpec<TLShape, Dto> = {
      ...SPEC,
      layerRange: ['a2' as IndexKey, 'a3' as IndexKey],
    };

    const { rerender } = renderHook(
      ({ currentItems }: { currentItems: Dto[] }) =>
        useShapeSync(customSpec, {
          editor: canvas.editor,
          pageId: 'page-1',
          items: currentItems,
          onItemsChanged: vi.fn(),
          onSavingChange: vi.fn(),
        }),
      {
        initialProps: {
          currentItems: [
            { id: 'b1', x: 10, order: 0 },
            { id: 'b2', x: 20, order: 1 },
          ],
        },
      },
    );

    const initialB1 = canvas.shapes.get('shape:test-b1')!;
    const initialB2 = canvas.shapes.get('shape:test-b2')!;
    expect(initialB1.index! < initialB2.index!).toBe(true);

    // 순서 변경: b2 가 0, b1 이 1
    rerender({
      currentItems: [
        { id: 'b2', x: 20, order: 0 },
        { id: 'b1', x: 10, order: 1 },
      ],
    });

    const updatedB1 = canvas.shapes.get('shape:test-b1')!;
    const updatedB2 = canvas.shapes.get('shape:test-b2')!;

    // 이제 b2 의 index 가 b1 보다 작아야 함 (b2 가 뒤, b1 이 앞)
    expect(updatedB2.index! < updatedB1.index!).toBe(true);
    expect(canvas.updateShape).toHaveBeenCalled();
  });
});
