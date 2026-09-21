import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type * as ApiModule from '@/lib/api';
import { useLayerReorder, type HasOrder } from './use-layer-reorder';

const { apiMock, pushToastMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  pushToastMock: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: apiMock,
  };
});

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    push: pushToastMock,
  }),
}));

interface TestItem extends HasOrder {
  id: string;
  order: number;
  label: string;
}

describe('useLayerReorder', () => {
  const initialItems: TestItem[] = [
    { id: 'item-1', order: 0, label: 'A' },
    { id: 'item-2', order: 1, label: 'B' },
    { id: 'item-3', order: 2, label: 'C' },
  ];
  const reorderPath = (pageId: string) => `/pages/${pageId}/speech-bubbles/reorder`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forward: 선택한 도형을 바로 앞 도형과 맞바꾸고 새 순열 ids로 POST 호출', async () => {
    const onItemsChanged = vi.fn();
    const freshData: TestItem[] = [
      { id: 'item-1', order: 0, label: 'A' },
      { id: 'item-3', order: 1, label: 'C' },
      { id: 'item-2', order: 2, label: 'B' },
    ];
    apiMock.mockResolvedValueOnce(freshData);

    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged,
        reorderPath,
      }),
    );

    let success = false;
    await act(async () => {
      success = await result.current.reorder('item-2', 'forward');
    });

    expect(success).toBe(true);
    // 1. 낙관적 갱신 호출
    expect(onItemsChanged).toHaveBeenNthCalledWith(1, [
      { id: 'item-1', order: 0, label: 'A' },
      { id: 'item-3', order: 1, label: 'C' },
      { id: 'item-2', order: 2, label: 'B' },
    ]);
    // 2. API 호출 확인
    expect(apiMock).toHaveBeenCalledWith('/pages/page-1/speech-bubbles/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids: ['item-1', 'item-3', 'item-2'] }),
    });
    // 3. 서버 응답 반영
    expect(onItemsChanged).toHaveBeenNthCalledWith(2, freshData);
  });

  it('backward: 선택한 도형을 바로 뒤 도형과 맞바꾼다', async () => {
    const onItemsChanged = vi.fn();
    apiMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged,
        reorderPath,
      }),
    );

    await act(async () => {
      await result.current.reorder('item-2', 'backward');
    });

    expect(onItemsChanged).toHaveBeenNthCalledWith(1, [
      { id: 'item-2', order: 0, label: 'B' },
      { id: 'item-1', order: 1, label: 'A' },
      { id: 'item-3', order: 2, label: 'C' },
    ]);
    expect(apiMock).toHaveBeenCalledWith('/pages/page-1/speech-bubbles/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids: ['item-2', 'item-1', 'item-3'] }),
    });
  });

  it('toFront: 선택한 도형을 맨 앞으로 보낸다', async () => {
    const onItemsChanged = vi.fn();
    apiMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged,
        reorderPath,
      }),
    );

    await act(async () => {
      await result.current.reorder('item-1', 'toFront');
    });

    expect(onItemsChanged).toHaveBeenNthCalledWith(1, [
      { id: 'item-2', order: 0, label: 'B' },
      { id: 'item-3', order: 1, label: 'C' },
      { id: 'item-1', order: 2, label: 'A' },
    ]);
    expect(apiMock).toHaveBeenCalledWith('/pages/page-1/speech-bubbles/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids: ['item-2', 'item-3', 'item-1'] }),
    });
  });

  it('toBack: 선택한 도형을 맨 뒤로 보낸다', async () => {
    const onItemsChanged = vi.fn();
    apiMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged,
        reorderPath,
      }),
    );

    await act(async () => {
      await result.current.reorder('item-3', 'toBack');
    });

    expect(onItemsChanged).toHaveBeenNthCalledWith(1, [
      { id: 'item-3', order: 0, label: 'C' },
      { id: 'item-1', order: 1, label: 'A' },
      { id: 'item-2', order: 2, label: 'B' },
    ]);
    expect(apiMock).toHaveBeenCalledWith('/pages/page-1/speech-bubbles/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids: ['item-3', 'item-1', 'item-2'] }),
    });
  });

  it('실패 시 이전 순서로 되돌리고(rollback) 에러 토스트를 띄운다', async () => {
    const onItemsChanged = vi.fn();
    apiMock.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged,
        reorderPath,
      }),
    );

    let success = true;
    await act(async () => {
      success = await result.current.reorder('item-2', 'forward');
    });

    expect(success).toBe(false);
    // 1. 첫 번째 호출: 낙관적 변경
    expect(onItemsChanged).toHaveBeenNthCalledWith(1, [
      { id: 'item-1', order: 0, label: 'A' },
      { id: 'item-3', order: 1, label: 'C' },
      { id: 'item-2', order: 2, label: 'B' },
    ]);
    // 2. 두 번째 호출: 실패로 인한 롤백 (이전 데이터)
    expect(onItemsChanged).toHaveBeenNthCalledWith(2, initialItems);
    // 3. 토스트 알림
    expect(pushToastMock).toHaveBeenCalledWith('error', expect.stringContaining('순서를 저장'));
  });

  it('이미 맨 앞이거나 맨 뒤인 경우 no-op 처리된다', async () => {
    const onItemsChanged = vi.fn();

    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged,
        reorderPath,
      }),
    );

    // 맨 앞(item-3)을 forward
    let res1: boolean = true;
    await act(async () => {
      res1 = await result.current.reorder('item-3', 'forward');
    });
    expect(res1).toBe(false);
    expect(apiMock).not.toHaveBeenCalled();

    // 맨 뒤(item-1)를 backward
    let res2: boolean = true;
    await act(async () => {
      res2 = await result.current.reorder('item-1', 'backward');
    });
    expect(res2).toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('getCanMove 가 올바른 이동 가능 여부를 반환한다', () => {
    const { result } = renderHook(() =>
      useLayerReorder({
        pageId: 'page-1',
        items: initialItems,
        onItemsChanged: vi.fn(),
        reorderPath,
      }),
    );

    // item-1 (맨 뒤): 뒤로 갈 수 없고, 앞으로 갈 수 있음
    expect(result.current.getCanMove('item-1')).toEqual({
      canMoveForward: true,
      canMoveBackward: false,
    });

    // item-2 (중간): 앞뒤 모두 이동 가능
    expect(result.current.getCanMove('item-2')).toEqual({
      canMoveForward: true,
      canMoveBackward: true,
    });

    // item-3 (맨 앞): 앞으로 갈 수 없고, 뒤로 갈 수 있음
    expect(result.current.getCanMove('item-3')).toEqual({
      canMoveForward: false,
      canMoveBackward: true,
    });

    // 존재하지 않는 ID
    expect(result.current.getCanMove('item-unknown')).toEqual({
      canMoveForward: false,
      canMoveBackward: false,
    });
  });
});
