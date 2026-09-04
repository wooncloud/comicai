'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ImagePlus, X } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
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
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';

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
  // 화면 문구에 쓰는 현재 탭 이름. 예전에는 전부 '항목' 이라 캐릭터 탭에서
  // "항목이 없습니다" 를 보면 무엇을 만들라는 건지 알 수 없었다.
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? '항목';
  const [items, setItems] = useState<ConsistencyEntityDTO[]>([]);
  const [editing, setEditing] = useState<ConsistencyEntityDTO | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const project = useProject(projectId);
  const queryClient = useQueryClient();
  const defaultStyleId = project?.defaultStyleId ?? null;
  const toast = useToast();

  async function setDefaultStyle(id: string) {
    try {
      const updated = await api<ProjectDTO>(ApiPaths.project(projectId), {
        method: 'PATCH',
        body: JSON.stringify({ defaultStyleId: id }),
      });
      queryClient.setQueryData(qk.project(projectId), updated);
      toast.push('success', '대표 그림체로 지정했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '대표 그림체로 지정'));
    }
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
        toast.push('success', `'${updated.name}'을(를) 수정했습니다.`);
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
        toast.push('success', `'${final.name}'을(를) 추가했습니다.`);
      }
      resetForm();
    } catch (err) {
      toast.push('error', errorMessage(err, `${tabLabel}을(를) 저장`));
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
    try {
      await api(ApiPaths.consistency(id), { method: 'DELETE' });
      setItems((prev) => prev.filter((p) => p.id !== id));
      toast.push('success', `${tabLabel}을(를) 삭제했습니다.`);
    } catch (err) {
      toast.push('error', errorMessage(err, `${tabLabel}을(를) 삭제`));
    }
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
      <PageContainer>
        <Breadcrumb
          items={[
            { label: '대시보드', href: '/dashboard' },
            { label: project?.name ?? '…', href: `/projects/${projectId}` },
            { label: '설정', href: `/projects/${projectId}/settings` },
            { label: '설정집' },
          ]}
        />
        <h1 className="mt-2 text-title-lg font-semibold sm:text-display-md">설정집</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          등장인물·배경·세계관은 컷 설명에서 @로 불러 씁니다. 그림체는 컷 설정에서 고릅니다. 한 번
          등록해 두면 컷이 바뀌어도 같은 모습으로 그려집니다.
        </p>

        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                resetForm();
              }}
              className={`-mb-px flex shrink-0 items-center whitespace-nowrap border-b-2 px-4 py-2 text-body-sm transition-colors touch:min-h-11 ${
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
                아직 등록한 {tabLabel}이(가) 없습니다. 아래 입력란에서 추가해 보세요.
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
              {editing ? `${editing.name} 수정` : `새 ${tabLabel}`}
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
                            className="-my-1 flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
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
      </PageContainer>
    </AppShell>
  );
}
