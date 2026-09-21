'use client';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { useToast } from '@/components/ui/toast';

export type LayerOrderAction = 'forward' | 'backward' | 'toFront' | 'toBack';

export interface HasOrder {
  id: string;
  order: number;
}

interface UseLayerReorderOptions<T extends HasOrder> {
  pageId: string;
  items: T[];
  onItemsChanged: (items: T[]) => void;
  reorderPath: (pageId: string) => string;
}

/**
 * 말풍선·텍스트·직선 등 같은 종류 안에서의 앞뒤 순서 변경 훅.
 *
 * 앞으로 · 뒤로 · 맨 앞으로 · 맨 뒤로 네 동작을 수행하며,
 * 낙관적 갱신 후 POST /pages/:id/.../reorder 로 영속화한다.
 * 실패 시 이전 순서로 캔버스와 상태를 되돌리고 에러 토스트를 띄운다.
 */
export function useLayerReorder<T extends HasOrder>({
  pageId,
  items,
  onItemsChanged,
  reorderPath,
}: UseLayerReorderOptions<T>) {
  const toast = useToast();

  const sorted = [...items].sort((a, b) => a.order - b.order);

  function getTargetIndex(currentIndex: number, action: LayerOrderAction): number {
    const lastIndex = sorted.length - 1;
    switch (action) {
      case 'toFront':
        return lastIndex;
      case 'forward':
        return Math.min(currentIndex + 1, lastIndex);
      case 'backward':
        return Math.max(currentIndex - 1, 0);
      case 'toBack':
        return 0;
    }
  }

  async function reorder(selectedId: string, action: LayerOrderAction): Promise<boolean> {
    const currentIndex = sorted.findIndex((item) => item.id === selectedId);
    if (currentIndex < 0) return false;

    const newIndex = getTargetIndex(currentIndex, action);
    if (currentIndex === newIndex) return false;

    const prev = items;
    const nextList = [...sorted];
    const [moved] = nextList.splice(currentIndex, 1);
    nextList.splice(newIndex, 0, moved!);
    const nextWithOrder = nextList.map((item, i) => ({ ...item, order: i }));

    onItemsChanged(nextWithOrder);

    try {
      const fresh = await api<T[]>(reorderPath(pageId), {
        method: 'POST',
        body: JSON.stringify({ ids: nextWithOrder.map((x) => x.id) }),
      });
      onItemsChanged(fresh);
      return true;
    } catch (err) {
      onItemsChanged(prev);
      toast.push('error', errorMessage(err, '순서를 저장'));
      return false;
    }
  }

  function getCanMove(selectedId: string): { canMoveForward: boolean; canMoveBackward: boolean } {
    const currentIndex = sorted.findIndex((item) => item.id === selectedId);
    if (currentIndex < 0) return { canMoveForward: false, canMoveBackward: false };
    return {
      canMoveForward: currentIndex < sorted.length - 1,
      canMoveBackward: currentIndex > 0,
    };
  }

  return { reorder, getCanMove };
}
