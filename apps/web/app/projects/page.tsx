'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/shell/app-shell';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ProjectsHome() {
  const [items, setItems] = useState<ProjectDTO[] | null>(null);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function refresh() {
    setItems(await api<ProjectDTO[]>(ApiPaths.projects));
  }

  useEffect(() => {
    refresh().catch(() => setItems([]));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const created = await api<ProjectDTO>(ApiPaths.projects, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setName('');
      setItems((prev) => (prev ? [created, ...prev] : [created]));
    } finally {
      setPending(false);
    }
  }

  function patchItem(next: ProjectDTO) {
    setItems((prev) => prev?.map((p) => (p.id === next.id ? next : p)) ?? prev);
  }
  function removeItem(id: string) {
    setItems((prev) => prev?.filter((p) => p.id !== id) ?? prev);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">프로젝트</h1>

        <form onSubmit={onCreate} className="mt-6 flex gap-2">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 프로젝트 이름"
            className="flex-1"
          />
          <Button type="submit" disabled={pending}>
            생성
          </Button>
        </form>

        <ul className="mt-8 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items === null && <li className="px-4 py-6 text-sm text-neutral-500">로딩…</li>}
          {items && items.length === 0 && (
            <li className="px-4 py-6 text-sm text-neutral-500">아직 프로젝트가 없습니다.</li>
          )}
          {items?.map((p) => (
            <ProjectRow key={p.id} project={p} onPatched={patchItem} onRemoved={removeItem} />
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

function ProjectRow({
  project,
  onPatched,
  onRemoved,
}: {
  project: ProjectDTO;
  onPatched: (p: ProjectDTO) => void;
  onRemoved: (id: string) => void;
}) {
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

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-4 py-3">
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
        <Button size="sm" variant="ghost" onClick={save} disabled={busy}>
          저장
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
          취소
        </Button>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
      <Link href={`/projects/${project.id}`} className="flex-1 font-medium">
        {project.name}
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500">
          {new Date(project.updatedAt).toLocaleString('ko-KR')}
        </span>
        <div className="flex gap-2 opacity-0 transition group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={() => setDraft(project.name)} disabled={busy}>
            이름변경
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={busy}
            className="text-red-600 hover:text-red-700"
          >
            삭제
          </Button>
        </div>
      </div>
    </li>
  );
}
