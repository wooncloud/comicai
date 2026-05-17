'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

interface Props {
  project: ProjectDTO;
  onPatched: (p: ProjectDTO) => void;
  onRemoved: (id: string) => void;
}

export function ProjectCard({ project, onPatched, onRemoved }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = draft !== null;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  const thumbUrl = project.thumbnailUrl ?? null;

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api<ProjectDTO>(ApiPaths.projectThumbnail(project.id), {
        method: 'POST',
        body: fd,
      });
      onPatched(updated);
      toast.push('success', '썸네일이 변경되었습니다.');
    } catch (err) {
      toast.push('error', (err as Error).message || '업로드에 실패했습니다.');
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
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <span className="text-display-md font-bold">{project.name.slice(0, 2)}</span>
          </div>
        )}
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          fileRef.current?.click();
        }}
        disabled={busy}
        title="썸네일 변경"
        className="absolute right-2 top-2 rounded bg-background/80 px-2 py-1 text-caption opacity-0 shadow-sm transition group-hover:opacity-100 hover:bg-background"
      >
        썸네일
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />
      <div className="flex items-center gap-2 border-t border-border bg-card p-3">
        {editing ? (
          <Input
            autoFocus
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
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
