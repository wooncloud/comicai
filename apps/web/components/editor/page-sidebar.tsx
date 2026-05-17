'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Check, X, GripVertical } from 'lucide-react';
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { ApiPaths, pageLabel, type PageDTO } from '@comicai/types';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { CollapseButton } from './collapse-button';
import { cn } from '@/lib/cn';

interface Props {
  projectId: string;
  currentPageId: string;
  /** 부모(에디터)가 현재 페이지를 변경했을 때 사이드바도 즉시 반영하기 위함. */
  currentPage?: PageDTO | null;
  /** 호출 시 사이드바를 접는다. 부재 시 토글 버튼 미노출. */
  onCollapse?: () => void;
}

export function PageSidebar({ projectId, currentPageId, currentPage, onCollapse }: Props) {
  const [pages, setPages] = useState<PageDTO[] | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<PageDTO[]>(ApiPaths.projectPages(projectId))
      .then(setPages)
      .catch(() => setPages([]));
  }, [projectId]);

  // 에디터에서 현재 페이지가 PATCH되면(size/name 변경) 리스트에도 반영.
  useEffect(() => {
    if (!currentPage) return;
    setPages((prev) => prev?.map((p) => (p.id === currentPage.id ? currentPage : p)) ?? prev);
  }, [currentPage]);

  async function addPage() {
    setAdding(true);
    try {
      const created = await api<PageDTO>(ApiPaths.projectPages(projectId), {
        method: 'POST',
        body: JSON.stringify({ size: { w: 800, h: 1200 } }),
      });
      setPages((prev) => [...(prev ?? []), created]);
    } finally {
      setAdding(false);
    }
  }

  async function renamePage(id: string, name: string | null) {
    const updated = await api<PageDTO>(ApiPaths.page(id), {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    setPages((prev) => prev?.map((p) => (p.id === id ? updated : p)) ?? prev);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
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
      toast.push('error', (err as Error).message || '순서 저장에 실패했습니다.');
    }
  }

  return (
    <aside className="flex w-36 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">페이지</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={addPage}
            disabled={adding}
            title="페이지 추가"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">페이지 추가</span>
          </button>
          {onCollapse && <CollapseButton side="left" onClick={onCollapse} title="사이드바 접기" />}
        </div>
      </div>
      <ul className="flex-1 overflow-auto p-1">
        {pages === null && <li className="text-caption text-muted-foreground">로딩…</li>}
        {pages && pages.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {pages.map((p) => (
                <PageRow
                  key={p.id}
                  projectId={projectId}
                  page={p}
                  active={p.id === currentPageId}
                  onRename={(name) => renamePage(p.id, name)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
        {pages?.length === 0 && (
          <li>
            <button
              onClick={addPage}
              disabled={adding}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-dashed border-border px-2 py-3 text-caption text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{adding ? '추가 중…' : '첫 페이지 만들기'}</span>
            </button>
          </li>
        )}
      </ul>
    </aside>
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
          placeholder={`p${page.order + 1}`}
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
          className="flex h-5 w-3 flex-none cursor-grab items-center justify-center text-muted-foreground/60 opacity-0 transition active:cursor-grabbing group-hover:opacity-100 hover:text-foreground"
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
            className="hidden h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </Link>
      </div>
    </li>
  );
}
