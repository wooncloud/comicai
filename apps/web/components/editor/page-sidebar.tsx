'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiPaths, pageLabel, type PageDTO } from '@comicai/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

interface Props {
  projectId: string;
  currentPageId: string;
  /** 부모(에디터)가 현재 페이지를 변경했을 때 사이드바도 즉시 반영하기 위함. */
  currentPage?: PageDTO | null;
}

export function PageSidebar({ projectId, currentPageId, currentPage }: Props) {
  const [pages, setPages] = useState<PageDTO[] | null>(null);
  const [adding, setAdding] = useState(false);

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

  return (
    <aside className="flex w-44 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <span className="text-caption font-medium text-muted-foreground">페이지</span>
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
      </div>
      <ul className="flex-1 overflow-auto p-2">
        {pages === null && <li className="text-caption text-muted-foreground">로딩…</li>}
        {pages?.map((p) => (
          <PageRow
            key={p.id}
            projectId={projectId}
            page={p}
            active={p.id === currentPageId}
            onRename={(name) => renamePage(p.id, name)}
          />
        ))}
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
      <li className="flex items-center gap-1 px-1 py-1">
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

  const thumb = page.backgroundUrl ?? null;
  return (
    <li className="group">
      <Link
        href={`/projects/${projectId}/pages/${page.id}`}
        className={cn(
          'flex items-center gap-2 rounded px-2 py-1.5 text-body-sm transition-colors',
          active
            ? 'bg-muted font-medium'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-8 w-6 flex-none rounded-sm border border-border object-cover"
          />
        ) : (
          <span
            className={cn(
              'flex h-8 w-6 flex-none items-center justify-center rounded-sm border border-border text-[10px] font-medium',
              active ? 'bg-background text-foreground' : 'bg-muted/40',
            )}
          >
            {page.order + 1}
          </span>
        )}
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
          className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <span className="ml-auto text-caption text-muted-foreground">
          {page.size.w}×{page.size.h}
        </span>
      </Link>
    </li>
  );
}
