'use client';
import {
  useSensor,
  useSensors,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { ApiPaths, type PageDTO } from '@comicai/types';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { useToast } from '@/components/ui/toast';

/**
 * 페이지 순서 바꾸기. 프로젝트 상세와 에디터 사이드바가 **같은 코드**를 쓴다.
 *
 * 예전에는 두 화면이 20줄 중 19줄이 같은 `onDragEnd` 와 `useSensors` 를 각자 들고
 * 있었고, **드래그 시작 거리가 6 과 4 로 이미 갈려 있었다** — 같은 동작인데 화면마다
 * 손끝 감각이 달랐다. 의도한 차이라는 근거는 어디에도 없었다.
 *
 * 낙관적 갱신을 먼저 하고 실패하면 되돌린다. 순서는 사용자가 방금 손으로 만든
 * 것이라 왕복을 기다리는 동안 옛 순서를 보여 주면 드래그가 튕긴 것처럼 보인다.
 */
export function usePageReorder(projectId: string, pages: PageDTO[] | undefined) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    // 6px 미만은 클릭으로 본다. 이 값이 없으면 목록 항목을 누르기만 해도 드래그가 시작된다.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function setPages(next: PageDTO[]) {
    queryClient.setQueryData(qk.projectPages(projectId), next);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !pages) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = pages;
    const next = arrayMove(pages, oldIndex, newIndex).map((p, i) => ({ ...p, order: i }));
    setPages(next);
    try {
      const fresh = await api<PageDTO[]>(ApiPaths.projectPagesReorder(projectId), {
        method: 'POST',
        body: JSON.stringify({ pageIds: next.map((p) => p.id) }),
      });
      setPages(fresh);
    } catch (err) {
      setPages(prev);
      toast.push('error', errorMessage(err, '순서를 저장'));
    }
  }

  return { sensors, onDragEnd };
}
