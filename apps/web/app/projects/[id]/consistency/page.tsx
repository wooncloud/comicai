'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import { ApiPaths, type ConsistencyEntityDTO, type EntityType } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TABS: { key: EntityType; label: string }[] = [
  { key: 'style', label: '그림체' },
  { key: 'character', label: '캐릭터' },
  { key: 'background', label: '배경' },
  { key: 'worldview', label: '세계관' },
];

export default function ConsistencyPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [tab, setTab] = useState<EntityType>('style');
  const [items, setItems] = useState<ConsistencyEntityDTO[]>([]);
  const [editing, setEditing] = useState<ConsistencyEntityDTO | null>(null);
  const [form, setForm] = useState({ name: '', aliases: '', description: '' });
  const project = useProject(projectId);

  async function refresh() {
    const list = await api<ConsistencyEntityDTO[]>(
      `${ApiPaths.projectConsistency(projectId)}?type=${tab}`,
    );
    setItems(list);
  }

  useEffect(() => {
    if (projectId) refresh();
  }, [projectId, tab]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      aliases: form.aliases
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description: form.description,
    };
    if (editing) {
      await api(ApiPaths.consistency(editing.id), {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await api(ApiPaths.projectConsistency(projectId), {
        method: 'POST',
        body: JSON.stringify({ type: tab, ...payload }),
      });
    }
    setEditing(null);
    setForm({ name: '', aliases: '', description: '' });
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await api(ApiPaths.consistency(id), { method: 'DELETE' });
    await refresh();
  }

  function beginEdit(item: ConsistencyEntityDTO) {
    setEditing(item);
    setForm({
      name: item.name,
      aliases: item.aliases.join(', '),
      description: item.description,
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Breadcrumb
          items={[
            { label: '프로젝트', href: '/projects' },
            { label: project?.name ?? '…', href: `/projects/${projectId}` },
            { label: '일관성 정보' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold">일관성 정보</h1>

        <div className="mt-6 flex gap-2 border-b border-neutral-200 dark:border-neutral-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setEditing(null);
                setForm({ name: '', aliases: '', description: '' });
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === t.key
                  ? 'border-neutral-900 font-medium dark:border-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
          <ul className="space-y-2">
            {items.length === 0 && (
              <li className="rounded-md border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
                항목이 없습니다.
              </li>
            )}
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <div>
                  <div className="font-medium">{it.name}</div>
                  {it.aliases.length > 0 && (
                    <div className="text-xs text-neutral-500">alias: {it.aliases.join(', ')}</div>
                  )}
                  {it.description && (
                    <div className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                      {it.description}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => beginEdit(it)} className="text-xs underline">
                    수정
                  </button>
                  <button onClick={() => remove(it.id)} className="text-xs text-red-600 underline">
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <form
            onSubmit={save}
            className="space-y-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"
          >
            <div className="font-medium">{editing ? `${editing.name} 수정` : '새 항목'}</div>
            <Input
              required
              placeholder="이름"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="별칭 (쉼표 구분)"
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            />
            <textarea
              placeholder="설명"
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                {editing ? '저장' : '추가'}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setForm({ name: '', aliases: '', description: '' });
                  }}
                >
                  취소
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
