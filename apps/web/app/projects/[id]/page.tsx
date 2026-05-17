'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { api } from '@/lib/api';
import { ApiPaths, pageLabel, type ModelId, type PageDTO, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini' },
  { id: 'gpt-image-2', label: 'OpenAI' },
];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [pages, setPages] = useState<PageDTO[]>([]);
  const toast = useToast();

  async function loadProject() {
    setProject(await api<ProjectDTO>(ApiPaths.project(projectId)));
  }
  async function loadPages() {
    setPages(await api<PageDTO[]>(ApiPaths.projectPages(projectId)));
  }

  useEffect(() => {
    if (!projectId) return;
    void loadProject();
    void loadPages();
  }, [projectId]);

  async function addPage() {
    try {
      await api(ApiPaths.projectPages(projectId), {
        method: 'POST',
        body: JSON.stringify({ size: { w: 800, h: 1200 } }),
      });
      await loadPages();
      toast.push('success', '페이지가 추가되었습니다.');
    } catch (err) {
      toast.push('error', (err as Error).message || '페이지 추가에 실패했습니다.');
    }
  }

  const sensors = useSensors(
    // 클릭과 드래그를 구분하기 위해 6px 이상 이동해야 활성화.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
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
      toast.push('error', (err as Error).message || '순서 저장에 실패했습니다.');
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-display-md font-semibold">{project?.name ?? '로딩…'}</h1>
          <div className="flex items-center gap-2">
            <label className="text-caption text-muted-foreground">대표 모델</label>
            <Select
              value={project?.defaultModel ?? '__none__'}
              onValueChange={async (v) => {
                const next = v === '__none__' ? null : (v as ModelId);
                try {
                  const updated = await api<ProjectDTO>(ApiPaths.project(projectId), {
                    method: 'PATCH',
                    body: JSON.stringify({ defaultModel: next }),
                  });
                  setProject(updated);
                } catch (err) {
                  toast.push('error', (err as Error).message || '저장 실패');
                }
              }}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="기본값" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">기본값(Gemini)</SelectItem>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${projectId}/consistency`}>일관성 관리</Link>
            </Button>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-title-lg font-semibold">페이지</h2>
            <Button onClick={addPage} variant="outline" size="sm">
              + 페이지 추가
            </Button>
          </div>
          {pages.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-body-sm text-muted-foreground">
              아직 페이지가 없습니다.
              <button onClick={addPage} className="ml-2 text-foreground underline">
                첫 페이지 만들기
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
                <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {pages.map((p) => (
                    <SortablePageCard
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
      </div>
    </AppShell>
  );
}

function SortablePageCard({
  projectId,
  page,
  onChanged,
}: {
  projectId: string;
  page: PageDTO;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`페이지 ${page.order + 1}을(를) 삭제하시겠습니까?`)) return;
    try {
      await api(ApiPaths.page(page.id), { method: 'DELETE' });
      onChanged();
      toast.push('success', '페이지가 삭제되었습니다.');
    } catch (err) {
      toast.push('error', (err as Error).message || '삭제에 실패했습니다.');
    }
  }
  const thumb = page.backgroundUrl ?? null;
  const label = pageLabel(page);
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group relative ${isDragging ? 'cursor-grabbing' : ''}`}
    >
      <Link
        href={`/projects/${projectId}/pages/${page.id}`}
        className="relative block aspect-[2/3] overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:border-foreground/30 hover:shadow-md"
      >
        {thumb ? (
          <>
            <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
              <div className="truncate text-body-sm font-medium text-white">{label}</div>
              <div className="text-[10px] text-white/70">
                {page.size.w}×{page.size.h}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-foreground">
            <div className="text-3xl font-semibold">{page.order + 1}</div>
            <div className="mt-1 truncate px-2 text-caption text-muted-foreground">{label}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {page.size.w}×{page.size.h}
            </div>
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          #{page.order + 1}
        </div>
      </Link>
      <button
        type="button"
        aria-label="드래그하여 순서 변경"
        {...attributes}
        {...listeners}
        className="absolute left-1/2 top-1.5 -translate-x-1/2 cursor-grab rounded bg-background/80 p-1 text-foreground opacity-0 shadow-sm transition active:cursor-grabbing group-hover:opacity-100 hover:bg-background"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={remove}
        title="삭제"
        className="absolute right-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 text-caption text-destructive opacity-0 shadow-sm transition group-hover:opacity-100 hover:bg-background"
      >
        삭제
      </button>
    </li>
  );
}
