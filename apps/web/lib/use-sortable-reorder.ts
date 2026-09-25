'use client';
import type { CSSProperties } from 'react';
import {
  useSensor,
  useSensors,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiPaths, type EpisodeDTO, type PageDTO } from '@comicai/types';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { useToast } from '@/components/ui/toast';

interface Ordered {
  id: string;
  order: number;
}

/**
 * `all` 에서 `next` 의 항목이 차지하던 **자리에** `next` 를 순서대로 채운다.
 *
 * 끌어서 바꾸는 목록은 캐시의 일부일 수 있다 — 화 하나의 페이지는 프로젝트 전체 페이지
 * 캐시의 한 토막이다. 예전에는 그 토막으로 캐시를 통째로 덮어써서, 한 화 안에서 순서를
 * 바꾸면 **다른 화의 페이지가 다시 불러올 때까지 사라졌다.** 자리를 지키며 채우면 다른
 * 항목은 건드리지 않는다.
 */
function fillInPlace<T extends Ordered>(all: readonly T[], next: readonly T[]): T[] {
  const ids = new Set(next.map((n) => n.id));
  let i = 0;
  return all.map((item) => (ids.has(item.id) ? next[i++]! : item));
}

/**
 * 끌어서 순서 바꾸기. 화 목록과 한 화의 페이지 목록이 **같은 코드**를 쓴다.
 *
 * 예전에는 화면마다 `onDragEnd` 와 `useSensors` 를 각자 들고 있었고, 드래그 시작 거리가
 * 6 과 4 로 갈려 있었다 — 같은 동작인데 목록마다 손끝 감각이 달랐다.
 *
 * 낙관적 갱신을 먼저 하고 실패하면 되돌린다. 순서는 사용자가 방금 손으로 만든 것이라
 * 왕복을 기다리는 동안 옛 순서를 보여 주면 드래그가 튕긴 것처럼 보인다.
 */
function useSortableReorder<T extends Ordered>({
  items,
  queryKey,
  save,
  failLabel,
}: {
  /** 지금 끌 수 있는 항목들, 보이는 순서대로. 캐시 전체일 필요는 없다. */
  items: T[] | undefined;
  queryKey: QueryKey;
  /** 새 순서를 보내고, 서버가 확정한 목록을 받는다. */
  save: (ids: string[]) => Promise<T[]>;
  failLabel: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    // 6px 미만은 클릭으로 본다. 없으면 항목을 누르기만 해도 드래그가 시작된다.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function write(next: T[]) {
    queryClient.setQueryData<T[]>(queryKey, (all) => (all ? fillInPlace(all, next) : next));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || !items) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = items;
    const next = arrayMove(items, oldIndex, newIndex).map((it, order) => ({ ...it, order }));
    write(next);
    try {
      write(await save(next.map((it) => it.id)));
    } catch (err) {
      write(prev);
      toast.push('error', errorMessage(err, failLabel));
    }
  }

  return { sensors, onDragEnd };
}

export function useEpisodeReorder(projectId: string, episodes: EpisodeDTO[] | undefined) {
  return useSortableReorder({
    items: episodes,
    queryKey: qk.projectEpisodes(projectId),
    save: (episodeIds) =>
      api<EpisodeDTO[]>(ApiPaths.projectEpisodesReorder(projectId), {
        method: 'POST',
        body: JSON.stringify({ episodeIds }),
      }),
    failLabel: '화 순서를 저장',
  });
}

/**
 * 한 화 안의 페이지 순서. 순서는 화 안에서만 의미가 있어 화마다 따로 끈다 —
 * 다른 화로 옮기는 동작은 아직 없다.
 */
export function usePageReorder(projectId: string, episodeId: string, pages: PageDTO[]) {
  return useSortableReorder({
    items: pages,
    queryKey: qk.projectPages(projectId),
    save: (pageIds) =>
      api<PageDTO[]>(ApiPaths.episodePagesReorder(episodeId), {
        method: 'POST',
        body: JSON.stringify({ pageIds }),
      }),
    failLabel: '순서를 저장',
  });
}

/** 끌 수 있는 한 줄. `useSortable` 의 결과를 행이 바로 쓰는 모양으로 묶는다. */
export function useSortableItem(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return { setNodeRef, style, isDragging, handleProps: { ...attributes, ...listeners } };
}
