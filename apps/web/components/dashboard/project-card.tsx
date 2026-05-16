'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  project: ProjectDTO;
  onPatched: (p: ProjectDTO) => void;
  onRemoved: (id: string) => void;
}

export function ProjectCard({ project, onPatched, onRemoved }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = draft !== null;

  async function save() {
    const name = draft?.trim() ?? '';
    if (!name || name === project.name) {
      setDraft(null);
      return;
    }
    setBusy(true);
    try {
      const updated = await api<ProjectDTO>(ApiPaths.project(project.id), {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      onPatched(updated);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`'${project.name}' 프로젝트를 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await api(ApiPaths.project(project.id), { method: 'DELETE' });
      onRemoved(project.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition hover:border-foreground/30 hover:shadow-md">
      <Link
        href={`/projects/${project.id}`}
        className="aspect-[4/3] bg-gradient-to-br from-muted to-muted/30"
        aria-label={project.name}
      >
        {project.thumbnail ? (
          <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <span className="text-display-md font-bold">{project.name.slice(0, 2)}</span>
          </div>
        )}
      </Link>
      <div className="flex items-center gap-2 border-t border-border bg-card p-3">
        {editing ? (
          <Input
            autoFocus
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setDraft(null);
            }}
            className="flex-1"
          />
        ) : (
          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
            <div className="truncate text-body-sm font-medium">{project.name}</div>
            <div className="mt-0.5 text-caption text-muted-foreground">
              {new Date(project.updatedAt).toLocaleDateString('ko-KR')} 수정
            </div>
          </Link>
        )}
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={save} disabled={busy}>
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
          </>
        ) : (
          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft(project.name)}
              disabled={busy}
            >
              이름
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={remove}
              disabled={busy}
              className="text-destructive"
            >
              삭제
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
