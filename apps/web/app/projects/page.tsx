'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/shell/app-shell';
import { api } from '@/lib/api';
import type { ProjectDTO } from '@comicai/types';

export default function ProjectsHome() {
  const [items, setItems] = useState<ProjectDTO[] | null>(null);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function refresh() {
    setItems(await api<ProjectDTO[]>('/projects'));
  }

  useEffect(() => {
    refresh().catch(() => setItems([]));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">프로젝트</h1>

        <form onSubmit={onCreate} className="mt-6 flex gap-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 프로젝트 이름"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            생성
          </button>
        </form>

        <ul className="mt-8 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items === null && <li className="px-4 py-6 text-sm text-neutral-500">로딩…</li>}
          {items && items.length === 0 && (
            <li className="px-4 py-6 text-sm text-neutral-500">아직 프로젝트가 없습니다.</li>
          )}
          {items?.map((p) => (
            <ProjectRow key={p.id} project={p} onChanged={refresh} />
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

function ProjectRow({ project, onChanged }: { project: ProjectDTO; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || name === project.name) {
      setEditing(false);
      setName(project.name);
      return;
    }
    setBusy(true);
    try {
      await api(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setEditing(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`'${project.name}' 프로젝트를 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-4 py-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setEditing(false); setName(project.name); }
          }}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button onClick={save} disabled={busy} className="text-xs text-neutral-600 hover:text-neutral-900 dark:hover:text-white">저장</button>
        <button onClick={() => { setEditing(false); setName(project.name); }} className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">취소</button>
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
          <button onClick={() => setEditing(true)} disabled={busy} className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">이름변경</button>
          <button onClick={remove} disabled={busy} className="text-xs text-red-600 hover:text-red-700">삭제</button>
        </div>
      </div>
    </li>
  );
}
