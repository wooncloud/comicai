'use client';
import { useState, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiPaths, episodeLabel, pageLabel, type EpisodeDTO, type PageDTO } from '@comicai/types';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useProjectEpisodes, useProjectPages } from '@/lib/queries';
import { useAddPage } from '@/lib/use-add-page';
import { useEpisodeReorder, usePageReorder, useSortableItem } from '@/lib/use-sortable-reorder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/cn';

/**
 * 프로젝트의 화 목록. 각 화 안에 그 화의 페이지가 들어 있다.
 *
 * 예전에는 페이지가 프로젝트에 바로 매달려 한 줄로 늘어섰다. 단편이면 괜찮지만
 * 연재에서는 40장이 평평하게 쌓여, 3화를 고치려면 목록을 세어야 했다.
 *
 * 페이지는 **화 안에서만** 끈다. 화마다 `DndContext` 를 따로 두어 다른 화로 끌리는
 * 일이 아예 없게 했다 — 화를 옮기는 동작은 아직 없고, 없는 동작을 드래그로
 * 시도하게 두면 "왜 안 되지" 가 된다.
 */
export function EpisodeList({ projectId }: { projectId: string }) {
  const toast = useToast();
  const { data: episodes, isLoading } = useProjectEpisodes(projectId);
  const { data: pages } = useProjectPages(projectId);
  const { sensors, onDragEnd } = useEpisodeReorder(projectId, episodes);
  const cache = useListCache(projectId);

  async function addEpisode() {
    try {
      const created = await api<EpisodeDTO>(ApiPaths.projectEpisodes(projectId), {
        method: 'POST',
        body: '{}',
      });
      cache.setEpisodes((prev) => [...prev, created]);
      toast.push('success', '화를 추가했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '화를 추가'));
    }
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-lg font-semibold">화</h2>
        <Button onClick={addEpisode} variant="outline" size="sm" className="shrink-0">
          <Plus className="h-4 w-4" />화 추가
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-10 text-body-sm text-muted-foreground">불러오는 중…</p>
      ) : episodes?.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
          <p className="text-body-sm text-muted-foreground">아직 화가 없습니다.</p>
          <p className="mt-1 text-caption text-muted-foreground">
            화를 하나 만들면 그 안에 페이지를 더할 수 있습니다.
          </p>
          <Button className="mt-4" onClick={addEpisode} variant="outline" size="sm">
            첫 화 만들기
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={(episodes ?? []).map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-4 space-y-3">
              {(episodes ?? []).map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  projectId={projectId}
                  episode={ep}
                  pages={(pages ?? []).filter((p) => p.episodeId === ep.id)}
                  onlyOne={(episodes ?? []).length <= 1}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

/**
 * 화·페이지 캐시를 응답으로 바로 고친다.
 *
 * 예전에는 무엇을 바꾸든 두 목록을 모두 무효화해 다시 받았다 — 화 제목 한 글자를
 * 고쳐도 페이지 목록(썸네일 URL 서명 포함)까지 새로 왔다. 바뀐 것은 응답에 다 있다.
 */
function useListCache(projectId: string) {
  const queryClient = useQueryClient();
  return {
    setEpisodes(fn: (prev: EpisodeDTO[]) => EpisodeDTO[]) {
      queryClient.setQueryData<EpisodeDTO[]>(qk.projectEpisodes(projectId), (p) => p && fn(p));
    },
    setPages(fn: (prev: PageDTO[]) => PageDTO[]) {
      queryClient.setQueryData<PageDTO[]>(qk.projectPages(projectId), (p) => p && fn(p));
    },
  };
}

function EpisodeCard({
  projectId,
  episode,
  pages,
  onlyOne,
}: {
  projectId: string;
  episode: EpisodeDTO;
  pages: PageDTO[];
  /** 마지막 한 화인가 — 그러면 삭제를 내밀지 않는다. 서버도 거부한다. */
  onlyOne: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const cache = useListCache(projectId);
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(episode.title ?? '');
  const { sensors, onDragEnd } = usePageReorder(projectId, episode.id, pages);
  const { addPage } = useAddPage(projectId);
  const { setNodeRef, style, isDragging, handleProps } = useSortableItem(episode.id);

  async function rename() {
    const next = draft.trim();
    setRenaming(false);
    // 비우면 제목을 지운다 — 다시 "N화" 로 보인다.
    if ((next || null) === episode.title) return;
    try {
      const updated = await api<EpisodeDTO>(ApiPaths.episode(episode.id), {
        method: 'PATCH',
        body: JSON.stringify({ title: next || null }),
      });
      cache.setEpisodes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      setDraft(episode.title ?? '');
      toast.push('error', errorMessage(err, '화 제목을 변경'));
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `'${episodeLabel(episode)}'을(를) 삭제할까요?`,
      body: `이 화의 페이지 ${pages.length}장과 그 안의 컷·말풍선이 함께 사라집니다. 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(ApiPaths.episode(episode.id), { method: 'DELETE' });
      // 화의 페이지는 서버에서 함께 지워진다(FK cascade).
      cache.setEpisodes((prev) => prev.filter((e) => e.id !== episode.id));
      cache.setPages((prev) => prev.filter((p) => p.episodeId !== episode.id));
      toast.push('success', '화를 삭제했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '화를 삭제'));
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-background',
        isDragging && 'shadow-md',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2 py-2">
        <DragHandle label={`${episodeLabel(episode)} 순서 변경`} {...handleProps} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? '페이지 접기' : '페이지 펼치기'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {renaming ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename();
              else if (e.key === 'Escape') {
                setDraft(episode.title ?? '');
                setRenaming(false);
              }
            }}
            maxLength={120}
            placeholder={`${episode.order + 1}화`}
            aria-label="화 제목"
            className="h-8 flex-1 text-body-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="제목 변경"
            className="min-w-0 flex-1 truncate text-left text-body-sm font-medium hover:underline"
          >
            {episodeLabel(episode)}
          </button>
        )}

        <span className="shrink-0 text-caption text-muted-foreground">{pages.length}쪽</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${episodeLabel(episode)} 메뉴`}
              className="shrink-0 px-2"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>제목 변경</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addPage(episode.id)}>페이지 추가</DropdownMenuItem>
            {/* 마지막 화는 지울 수 없다 — 페이지가 갈 곳이 없어진다. 서버도 거부한다. */}
            {!onlyOne && (
              <DropdownMenuItem className="text-destructive" onSelect={remove}>
                화 삭제
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div className="p-2">
          {pages.length === 0 ? (
            <p className="px-2 py-3 text-caption text-muted-foreground">아직 페이지가 없습니다.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={pages.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="divide-y divide-border">
                  {pages.map((p) => (
                    <PageRow key={p.id} projectId={projectId} page={p} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <Button
            onClick={() => addPage(episode.id)}
            variant="ghost"
            size="sm"
            className="mt-1 w-full text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            페이지 추가
          </Button>
        </div>
      )}
    </li>
  );
}

function PageRow({ projectId, page }: { projectId: string; page: PageDTO }) {
  const toast = useToast();
  const confirm = useConfirm();
  const cache = useListCache(projectId);
  const { setNodeRef, style, isDragging, handleProps } = useSortableItem(page.id);

  async function remove() {
    const ok = await confirm({
      title: `'${pageLabel(page)}'을(를) 삭제할까요?`,
      body: '이 페이지의 컷·말풍선·텍스트가 함께 사라집니다. 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(ApiPaths.page(page.id), { method: 'DELETE' });
      cache.setPages((prev) => prev.filter((p) => p.id !== page.id));
      toast.push('success', '페이지를 삭제했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '페이지를 삭제'));
    }
  }

  const thumb = page.backgroundUrl ?? null;
  const label = pageLabel(page);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 bg-background px-1 py-1.5 transition-colors',
        isDragging ? 'shadow-md' : 'hover:bg-muted/40',
      )}
    >
      <DragHandle label={`${label} 순서 변경`} {...handleProps} />

      <Link
        href={`/projects/${projectId}/pages/${page.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-1"
      >
        <span className="flex h-10 w-[1.75rem] shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-caption font-semibold text-muted-foreground/70">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            page.order + 1
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium">{label}</span>
          <span className="mt-0.5 block text-caption text-muted-foreground">
            {page.size.w}×{page.size.h}
          </span>
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`${label} 메뉴`} className="shrink-0 px-2">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link href={`/projects/${projectId}/pages/${page.id}`}>편집</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={remove}>
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/**
 * 끌기 손잡이. 화와 페이지가 같은 것을 쓴다.
 *
 * 항상 보인다. `reveal-on-hover` 였을 때는 hover 가 없는 기기에서 투명한 채로 남아,
 * 터치로는 순서를 아예 바꿀 수 없었다. `touch-none` 은 dnd-kit 이 포인터 드래그를
 * 받으려면 필수다 — 없으면 브라우저가 스크롤로 가로챈다.
 */
function DragHandle({
  label,
  ...handleProps
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...handleProps}
      className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing touch:h-11"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
