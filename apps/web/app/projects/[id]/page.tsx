'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Settings } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/lib/use-project';
import { qk } from '@/lib/query-keys';
import { usePageReorder } from '@/lib/use-page-reorder';
import { ApiPaths, pageLabel, type PageDTO } from '@comicai/types';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { useConfirm } from '@/components/ui/confirm';

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const toast = useToast();
  const queryClient = useQueryClient();

  /*
   * 예전에는 `useState` + `void load…()` 로 읽었고 `catch` 가 없었다. 조회가
   * 실패하면 제목은 영원히 "불러오는 중…", 본문에는 **"아직 페이지가 없습니다"**
   * 점선 박스가 떴다 — 페이지 10장짜리 작품을 가진 사람이 자기 작업이 날아갔다고
   * 읽는다. react-query 안으로 들여보내면 실패가 오류 경계로 간다.
   */
  const project = useProject(projectId);
  const { data: pages, isLoading: pagesLoading } = useQuery<PageDTO[]>({
    queryKey: qk.projectPages(projectId),
    queryFn: () => api<PageDTO[]>(ApiPaths.projectPages(projectId)),
    enabled: !!projectId,
  });
  const { sensors, onDragEnd } = usePageReorder(projectId, pages);

  async function loadPages() {
    await queryClient.invalidateQueries({ queryKey: qk.projectPages(projectId) });
  }

  async function addPage() {
    try {
      await api(ApiPaths.projectPages(projectId), {
        method: 'POST',
        body: JSON.stringify({ size: { w: 800, h: 1200 } }),
      });
      await loadPages();
      toast.push('success', '페이지가 추가되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '페이지를 추가'));
    }
  }

  return (
    <AppShell>
      <PageContainer>
        <Breadcrumb
          items={[{ label: '대시보드', href: '/dashboard' }, { label: project?.name ?? '…' }]}
        />
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="min-w-0 break-words text-title-lg font-semibold [text-wrap:balance] sm:text-display-md">
            {/* 제목 자리가 비면 레이아웃이 흔들리므로 자리는 지키되, 아직 이름이
                아닌 것을 제목 크기로 외치지 않는다. */}
            {project?.name ?? (
              <span className="text-body-lg font-normal text-muted-foreground">불러오는 중…</span>
            )}
          </h1>
          <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-auto">
            <Link href={`/projects/${projectId}/settings`}>
              <Settings className="h-4 w-4 shrink-0" />
              프로젝트 설정
            </Link>
          </Button>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-title-lg font-semibold">페이지</h2>
            <Button onClick={addPage} variant="outline" size="sm" className="shrink-0">
              + 페이지 추가
            </Button>
          </div>
          {pagesLoading ? (
            <p className="mt-10 text-body-sm text-muted-foreground">불러오는 중…</p>
          ) : pages?.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
              <p className="text-body-sm text-muted-foreground">아직 페이지가 없습니다.</p>
              <Button className="mt-4" onClick={addPage} variant="outline" size="sm">
                첫 페이지 만들기
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={(pages ?? []).map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {(pages ?? []).map((p) => (
                    <SortablePageRow
                      key={p.id}
                      projectId={projectId}
                      page={p}
                      onChanged={loadPages}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>
      </PageContainer>
    </AppShell>
  );
}

function SortablePageRow({
  projectId,
  page,
  onChanged,
}: {
  projectId: string;
  page: PageDTO;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  async function remove() {
    const ok = await confirm({
      title: `페이지 ${page.order + 1}을(를) 삭제할까요?`,
      body: '이 페이지의 컷·말풍선·텍스트가 함께 사라집니다. 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(ApiPaths.page(page.id), { method: 'DELETE' });
      onChanged();
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
      className={`flex items-center gap-3 bg-background px-3 py-2.5 transition-colors ${
        isDragging ? 'shadow-md' : 'hover:bg-muted/40'
      }`}
    >
      {/*
        핸들은 항상 보인다. 예전에는 `reveal-on-hover` 라 hover 가 없는 기기에서는
        투명한 채로 남아, 터치로는 페이지 순서를 아예 바꿀 수 없었다.
        `touch-none` 은 dnd-kit 이 포인터 드래그를 받으려면 필수다 —
        없으면 브라우저가 그 제스처를 스크롤로 가로챈다.
      */}
      <button
        type="button"
        aria-label={`${label} 순서 변경`}
        {...attributes}
        {...listeners}
        className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing touch:h-11"
      >
        <GripVertical className="h-4 w-4" />
      </button>

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
