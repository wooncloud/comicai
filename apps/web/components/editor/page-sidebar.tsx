'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiPaths, type PageDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface Props {
  projectId: string;
  currentPageId: string;
}

export function PageSidebar({ projectId, currentPageId }: Props) {
  const [pages, setPages] = useState<PageDTO[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api<PageDTO[]>(ApiPaths.projectPages(projectId))
      .then(setPages)
      .catch(() => setPages([]));
  }, [projectId]);

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

  return (
    <aside className="flex w-44 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-2 text-caption font-medium text-muted-foreground">
        페이지
      </div>
      <ul className="flex-1 overflow-auto p-2">
        {pages === null && <li className="text-caption text-muted-foreground">로딩…</li>}
        {pages?.map((p) => (
          <li key={p.id}>
            <Link
              href={`/projects/${projectId}/pages/${p.id}`}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 text-body-sm transition-colors',
                p.id === currentPageId
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-2 w-2 rounded-full',
                  p.id === currentPageId ? 'bg-foreground' : 'bg-transparent',
                )}
              />
              <span>p{p.order + 1}</span>
              <span className="ml-auto text-caption text-muted-foreground">
                {p.size.w}×{p.size.h}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-border p-2">
        <Button variant="ghost" size="sm" className="w-full" onClick={addPage} disabled={adding}>
          {adding ? '추가 중…' : '+ 페이지'}
        </Button>
      </div>
    </aside>
  );
}
