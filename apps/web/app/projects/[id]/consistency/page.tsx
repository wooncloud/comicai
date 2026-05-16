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
import { EntityCard } from '@/components/consistency/entity-card';

const TABS: { key: EntityType; label: string }[] = [
  { key: 'style', label: '그림체' },
  { key: 'character', label: '캐릭터' },
  { key: 'background', label: '배경' },
  { key: 'worldview', label: '세계관' },
];

const EMPTY_FORM = { name: '', aliases: '', description: '' };

export default function ConsistencyPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [tab, setTab] = useState<EntityType>('style');
  const [items, setItems] = useState<ConsistencyEntityDTO[]>([]);
  const [editing, setEditing] = useState<ConsistencyEntityDTO | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
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
      const updated = await api<ConsistencyEntityDTO>(ApiPaths.consistency(editing.id), {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } else {
      const created = await api<ConsistencyEntityDTO>(ApiPaths.projectConsistency(projectId), {
        method: 'POST',
        body: JSON.stringify({ type: tab, ...payload }),
      });
      setItems((prev) => [created, ...prev]);
    }
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function remove(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await api(ApiPaths.consistency(id), { method: 'DELETE' });
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  function beginEdit(item: ConsistencyEntityDTO) {
    setEditing(item);
    setForm({
      name: item.name,
      aliases: item.aliases.join(', '),
      description: item.description,
    });
  }

  function applyUpdated(next: ConsistencyEntityDTO) {
    setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Breadcrumb
          items={[
            { label: '대시보드', href: '/dashboard' },
            { label: project?.name ?? '…', href: `/projects/${projectId}` },
            { label: '일관성 정보' },
          ]}
        />
        <h1 className="mt-2 text-display-md font-semibold">일관성 정보</h1>

        <div className="mt-6 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setEditing(null);
                setForm(EMPTY_FORM);
              }}
              className={`-mb-px border-b-2 px-4 py-2 text-body-sm transition-colors ${
                tab === t.key
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
          <section className="space-y-4">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-body-sm text-muted-foreground">
                항목이 없습니다. 오른쪽 폼으로 추가해보세요.
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {items.map((it) => (
                  <EntityCard
                    key={it.id}
                    entity={it}
                    onUpdated={applyUpdated}
                    onEdit={() => beginEdit(it)}
                    onRemove={() => remove(it.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <aside className="sticky top-20 h-fit space-y-3 rounded-lg border border-border bg-card p-4">
            <h2 className="text-body-lg font-medium">
              {editing ? `${editing.name} 수정` : '새 항목'}
            </h2>
            <form onSubmit={save} className="space-y-3">
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
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-body-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                      setForm(EMPTY_FORM);
                    }}
                  >
                    취소
                  </Button>
                )}
              </div>
            </form>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
