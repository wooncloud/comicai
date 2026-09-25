'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus, Pencil, Check, X, GripVertical } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { usePageReorder } from '@/lib/use-page-reorder';
import { ApiPaths, episodeLabel, pageLabel, type EpisodeDTO, type PageDTO } from '@comicai/types';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/error-message';

interface Props {
  projectId: string;
  currentPageId: string;
  /**
   * 현재 페이지의 레코드는 **부모(에디터)가** 들고 있다. 브레드크럼과 캔버스 프레임
   * 라벨이 읽는 것이 그 값이라, 이 목록은 그걸 비추기만 한다(아래 useEffect).
   *
   * 그래서 둘은 한 쌍이다 — 비추기만 하려면 바꿀 곳도 알아야 한다.
   */
  currentPage: PageDTO | null;
  onCurrentPageUpdated: (page: PageDTO) => void;
}

/**
 * 에디터 왼쪽의 화 > 페이지 목록.
 *
 * 예전에는 프로젝트의 페이지가 한 줄로 늘어섰다. 연재에서는 40장이 평평하게 쌓여
 * 3화의 두 번째 장을 찾으려면 세어야 했다. 이제 화로 묶고, **지금 보고 있는 화만**
 * 펼친다 — 나머지는 제목만 남아 목록이 짧게 유지된다.
 */
export function PageSidebar({
  projectId,
  currentPageId,
  currentPage,
  onCurrentPageUpdated,
}: Props) {
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: episodes } = useQuery<EpisodeDTO[]>({
    queryKey: qk.projectEpisodes(projectId),
    queryFn: () => api<EpisodeDTO[]>(ApiPaths.projectEpisodes(projectId)),
    enabled: !!projectId,
  });

  /*
   * 프로젝트 상세 화면과 **같은 캐시**를 본다. 예전에는 두 화면이 각자 로드해서,
   * 사이드바에서 페이지를 추가해도 상세 화면은 몰랐다.
   *
   * 그리고 예전 `.catch(() => setPages([]))` 는 실패를 **"페이지가 없다" 로 명시적으로
   * 번역**하고 있었다 — 조회가 죽으면 사이드바가 빈 목록을 보여 주고, 사용자는 자기
   * 페이지가 사라진 줄 안다. 지금은 실패가 오류 경계로 간다.
   */
  const { data: pages } = useQuery<PageDTO[]>({
    queryKey: qk.projectPages(projectId),
    queryFn: () => api<PageDTO[]>(ApiPaths.projectPages(projectId)),
    enabled: !!projectId,
  });

  /** 지금 보고 있는 화. 이 화만 펼친 채로 둔다. */
  const currentEpisodeId = currentPage?.episodeId ?? null;
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    // 페이지를 옮기면 그 화가 펼쳐진다. 사용자가 손으로 연 다른 화는 닫지 않는다.
    if (currentEpisodeId) setOpenIds((prev) => new Set(prev).add(currentEpisodeId));
  }, [currentEpisodeId]);

  // 아래 이펙트의 의존성에 들어가므로 렌더마다 새로 만들면 안 된다 — 이 함수가
  // 캐시를 쓰고, 그게 다시 렌더를 부른다.
  const setPages = useCallback(
    (next: PageDTO[] | ((prev: PageDTO[]) => PageDTO[])) => {
      queryClient.setQueryData<PageDTO[]>(qk.projectPages(projectId), (prev) =>
        typeof next === 'function' ? next(prev ?? []) : next,
      );
    },
    [queryClient, projectId],
  );

  // 현재 페이지 행이 바뀌는 유일한 경로. 부모가 들고 있는 레코드(size/name)를
  // 목록에 비춘다 — 아래 renamePage 도 목록이 아니라 부모에 쓰고 여기로 돌아온다.
  useEffect(() => {
    if (!currentPage) return;
    setPages((prev) => prev.map((p) => (p.id === currentPage.id ? currentPage : p)));
  }, [currentPage, setPages]);

  const grouped = useMemo(
    () =>
      (episodes ?? []).map((ep) => ({
        episode: ep,
        pages: (pages ?? []).filter((p) => p.episodeId === ep.id),
      })),
    [episodes, pages],
  );

  async function addPage(episodeId: string) {
    setAdding(true);
    try {
      const created = await api<PageDTO>(ApiPaths.episodePages(episodeId), {
        method: 'POST',
        body: '{}',
      });
      setPages((prev) => [...prev, created]);
      await queryClient.invalidateQueries({ queryKey: qk.projectEpisodes(projectId) });
      toast.push('success', '페이지가 추가되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '페이지를 추가'));
    } finally {
      setAdding(false);
    }
  }

  async function renamePage(id: string, name: string | null) {
    try {
      const updated = await api<PageDTO>(ApiPaths.page(id), {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      /*
       * 현재 페이지면 목록이 아니라 **부모에** 쓴다.
       *
       * 예전에는 여기서 목록만 고쳤다. 그래서 사이드바의 이름만 바뀌고 브레드크럼과
       * 캔버스 프레임 라벨은 새로고침할 때까지 옛 이름 그대로였다 — 그 둘이 읽는 것은
       * 부모가 들고 있는 레코드이기 때문이다.
       */
      if (id === currentPageId) onCurrentPageUpdated(updated);
      else setPages((prev) => prev.map((p) => (p.id === id ? updated : p)));
      toast.push('success', '페이지 이름을 변경했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '이름을 변경'));
    }
  }

  return (
    <aside className="flex min-w-0 flex-1 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <span className="min-w-0 truncate text-xs uppercase tracking-wide text-muted-foreground">
          화 · 페이지
        </span>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {!episodes || !pages ? (
          <p className="px-1 text-caption text-muted-foreground">불러오는 중…</p>
        ) : (
          grouped.map(({ episode, pages: inEpisode }) => (
            <EpisodeGroup
              key={episode.id}
              projectId={projectId}
              episode={episode}
              pages={inEpisode}
              open={openIds.has(episode.id)}
              onToggle={() =>
                setOpenIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(episode.id)) next.delete(episode.id);
                  else next.add(episode.id);
                  return next;
                })
              }
              currentPageId={currentPageId}
              adding={adding}
              onAddPage={() => addPage(episode.id)}
              onRename={renamePage}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function EpisodeGroup({
  projectId,
  episode,
  pages,
  open,
  onToggle,
  currentPageId,
  adding,
  onAddPage,
  onRename,
}: {
  projectId: string;
  episode: EpisodeDTO;
  pages: PageDTO[];
  open: boolean;
  onToggle: () => void;
  currentPageId: string;
  adding: boolean;
  onAddPage: () => void;
  onRename: (id: string, name: string | null) => Promise<void>;
}) {
  const { sensors, onDragEnd } = usePageReorder(projectId, pages);

  return (
    <div className="mb-0.5">
      <div className="group flex items-center gap-0.5 rounded pr-0.5 hover:bg-muted/50">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-left text-caption font-medium text-foreground"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate" title={episodeLabel(episode)}>
            {episodeLabel(episode)}
          </span>
        </button>
        <button
          type="button"
          onClick={onAddPage}
          disabled={adding}
          title={`${episodeLabel(episode)}에 페이지 추가`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="sr-only">페이지 추가</span>
        </button>
      </div>

      {open &&
        (pages.length === 0 ? (
          <p className="py-1 pl-6 text-caption text-muted-foreground">비어 있음</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="pl-2">
                {pages.map((p) => (
                  <PageRow
                    key={p.id}
                    projectId={projectId}
                    page={p}
                    active={p.id === currentPageId}
                    onRename={(name) => onRename(p.id, name)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ))}
    </div>
  );
}

interface RowProps {
  projectId: string;
  page: PageDTO;
  active: boolean;
  onRename: (name: string | null) => Promise<void>;
}

function PageRow({ projectId, page, active, onRename }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.name ?? '');
  const [busy, setBusy] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === page.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li ref={setNodeRef} style={style} className="flex items-center gap-1 px-1 py-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            else if (e.key === 'Escape') {
              setDraft(page.name ?? '');
              setEditing(false);
            }
          }}
          maxLength={80}
          placeholder={`${page.order + 1}쪽`}
          className="h-7 flex-1 text-body-sm"
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={busy}
          title="저장"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(page.name ?? '');
            setEditing(false);
          }}
          title="취소"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className="group">
      <div
        className={cn(
          'flex items-center gap-1 rounded text-body-sm transition-colors',
          active
            ? 'bg-muted font-medium'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >
        <button
          type="button"
          aria-label="드래그하여 순서 변경"
          {...attributes}
          {...listeners}
          className="reveal-on-hover flex h-5 w-3 flex-none cursor-grab items-center justify-center text-muted-foreground/60 active:cursor-grabbing hover:text-foreground"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <Link
          href={`/projects/${projectId}/pages/${page.id}`}
          className="flex min-w-0 flex-1 items-center gap-1 py-1 pr-1"
        >
          <span className="min-w-0 flex-1 truncate" title={pageLabel(page)}>
            {pageLabel(page)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditing(true);
            }}
            title="이름 변경"
            className="reveal-on-hover flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </Link>
      </div>
    </li>
  );
}
