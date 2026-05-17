'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ImagePlus, X } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import {
  ApiPaths,
  type ConsistencyEntityDTO,
  type EntityType,
  type ProjectDTO,
} from '@comicai/types';
import { useQueryClient } from '@tanstack/react-query';
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
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const project = useProject(projectId);
  const queryClient = useQueryClient();
  const defaultStyleId = project?.defaultStyleId ?? null;

  async function setDefaultStyle(id: string) {
    const updated = await api<ProjectDTO>(ApiPaths.project(projectId), {
      method: 'PATCH',
      body: JSON.stringify({ defaultStyleId: id }),
    });
    queryClient.setQueryData(['project', projectId], updated);
  }

  async function refresh() {
    const list = await api<ConsistencyEntityDTO[]>(
      `${ApiPaths.projectConsistency(projectId)}?type=${tab}`,
    );
    setItems(list);
  }

  useEffect(() => {
    if (projectId) void refresh();
  }, [projectId, tab]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
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
        // 폼에 첨부된 이미지가 있으면 같은 호출 흐름에서 업로드해 새 카드에 즉시 반영.
        let final = created;
        if (pendingImages.length > 0) {
          const fd = new FormData();
          for (const f of pendingImages) fd.append('files', f);
          final = await api<ConsistencyEntityDTO>(ApiPaths.consistencyImages(created.id), {
            method: 'POST',
            body: fd,
          });
        }
        setItems((prev) => [final, ...prev]);
      }
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPendingImages([]);
    if (fileRef.current) fileRef.current.value = '';
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
    setPendingImages([]);
    if (fileRef.current) fileRef.current.value = '';
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
                resetForm();
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
                    isDefault={tab === 'style' && it.id === defaultStyleId}
                    onSetDefault={tab === 'style' ? () => setDefaultStyle(it.id) : undefined}
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
              {!editing && (
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-3 text-caption text-muted-foreground hover:border-foreground/40 hover:text-foreground">
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>
                      참조 이미지 첨부{pendingImages.length > 0 ? ` (${pendingImages.length})` : ''}
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => setPendingImages(Array.from(e.target.files ?? []))}
                    />
                  </label>
                  {pendingImages.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {pendingImages.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-caption"
                        >
                          <span className="max-w-[120px] truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingImages((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="text-muted-foreground hover:text-foreground"
                            title="제거"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? '저장 중…' : editing ? '저장' : '추가'}
                </Button>
                {editing && (
                  <Button type="button" variant="outline" size="sm" onClick={resetForm}>
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
