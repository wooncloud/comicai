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
import { ApiPaths, type EpisodeDTO } from '@comicai/types';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { useToast } from '@/components/ui/toast';

/**
 * 화 순서 바꾸기. `usePageReorder` 와 같은 모양이다 — 드래그 감각이 목록마다 다르면 안 된다.
 *
 * 낙관적 갱신을 먼저 하고 실패하면 되돌린다. 순서는 사용자가 방금 손으로 만든 것이라
 * 왕복을 기다리는 동안 옛 순서를 보여 주면 드래그가 튕긴 것처럼 보인다.
 */
export function useEpisodeReorder(projectId: string, episodes: EpisodeDTO[] | undefined) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    // 6px 미만은 클릭으로 본다. 없으면 항목을 누르기만 해도 드래그가 시작된다.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function setEpisodes(next: EpisodeDTO[]) {
    queryClient.setQueryData(qk.projectEpisodes(projectId), next);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !episodes) return;
    const oldIndex = episodes.findIndex((e) => e.id === active.id);
    const newIndex = episodes.findIndex((e) => e.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = episodes;
    const next = arrayMove(episodes, oldIndex, newIndex).map((e, i) => ({ ...e, order: i }));
    setEpisodes(next);
    try {
      const fresh = await api<EpisodeDTO[]>(ApiPaths.projectEpisodesReorder(projectId), {
        method: 'POST',
        body: JSON.stringify({ episodeIds: next.map((e) => e.id) }),
      });
      setEpisodes(fresh);
    } catch (err) {
      setEpisodes(prev);
      toast.push('error', errorMessage(err, '화 순서를 저장'));
    }
  }

  return { sensors, onDragEnd };
}
