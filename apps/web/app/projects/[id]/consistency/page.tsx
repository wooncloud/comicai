'use client';
import { Suspense, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import {
  ApiPaths,
  ENTITY_TYPES,
  ENTITY_TYPE_LABEL,
  pageLabel,
  type ConsistencyEntityDTO,
  type EntityType,
  type PageDTO,
  type ProjectDTO,
} from '@comicai/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntityCard } from '@/components/consistency/entity-card';
import { EntityImageDialog } from '@/components/consistency/entity-image-dialog';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';
import { useConfirm } from '@/components/ui/confirm';

const EMPTY_FORM = { name: '', aliases: '', description: '' };

/** `?type=` 가 없거나 모르는 값이면 첫 탭. 프로젝트 화면의 요약이 이 쿼리로 들어온다. */
function tabFromQuery(raw: string | null): EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(raw ?? '')
    ? (raw as EntityType)
    : ENTITY_TYPES[0];
}

/*
 * `useSearchParams` 는 정적 셸을 만들 때 Suspense 경계를 요구한다(Next 규칙).
 * 클라이언트에서는 즉시 값을 돌려주므로 이 경계는 런타임 비용이 아니다.
 */
export default function ConsistencyRoute() {
  return (
    <Suspense fallback={null}>
      <ConsistencyPage />
    </Suspense>
  );
}

function ConsistencyPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const searchParams = useSearchParams();
  /*
   * 에디터에서 왔으면 **보던 페이지로 돌아갈 길**을 남긴다.
   *
   * 없을 때 무슨 일이 있었나. 컷을 그리다 캐릭터 설명을 고치러 오면, 여기 브레드크럼은
   * 대시보드 / 프로젝트 / 설정집 뿐이라 프로젝트 목록까지 나갔다가 페이지를 다시
   * 골라 들어가야 했다 — 어느 페이지를 보고 있었는지는 사용자가 기억해야 했다.
   */
  const fromPageId = searchParams.get('from');
  const [tab, setTab] = useState<EntityType>(() => tabFromQuery(searchParams.get('type')));
  // 화면 문구에 쓰는 현재 탭 이름. 예전에는 전부 '항목' 이라 캐릭터 탭에서
  // "항목이 없습니다" 를 보면 무엇을 만들라는 건지 알 수 없었다.
  const tabLabel = ENTITY_TYPE_LABEL[tab];
  const [editing, setEditing] = useState<ConsistencyEntityDTO | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  /** 저장 직후 참조 이미지 다이얼로그를 열 대상. */
  const [imageTarget, setImageTarget] = useState<ConsistencyEntityDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const project = useProject(projectId);
  const queryClient = useQueryClient();
  const defaultStyleId = project?.defaultStyleId ?? null;
  const toast = useToast();
  const confirm = useConfirm();

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

  /*
   * **한 번에 다 읽고 탭은 걸러서 본다.** 프로젝트 하나의 설정집은 수십 개 규모라
   * 네 번 나눠 읽을 이유가 없다.
   *
   * 예전에는 탭마다 키가 갈렸다(`['consistency', pid, 'character']`). 그런데 프로젝트
   * 화면의 요약은 전체 키(`['consistency', pid]`)를 보고, 컷 인스펙터는 또 style 키를
   * 본다 — **같은 데이터에 캐시가 셋**이었다. 여기서 캐릭터를 추가하면 이 탭의 캐시만
   * 고쳐지고, 뒤로 나간 프로젝트 화면은 새로고침하기 전까지 옛 목록을 보여 줬다.
   * 실제로 사장님이 그걸 밟았다(2026-09-25).
   *
   * 키가 하나면 낙관적 갱신 한 번이 세 화면에 모두 닿는다. 탭 전환도 즉시다 —
   * 예전에 탭별 키를 둔 이유였던 "이전 탭 카드가 남는다·늦은 응답이 다른 탭에 붙는다"
   * 는 애초에 탭마다 따로 읽었기 때문에 생긴 문제라, 안 나눠 읽으면 사라진다.
   */
  const { data: fromPage } = useQuery<PageDTO>({
    queryKey: qk.page(fromPageId),
    queryFn: () => api<PageDTO>(ApiPaths.page(fromPageId!)),
    enabled: !!fromPageId,
    // 돌아갈 링크 하나를 못 읽었다고 설정집 전체를 오류로 바꾸지 않는다.
    throwOnError: false,
  });

  const { data: all, isLoading } = useQuery<ConsistencyEntityDTO[]>({
    queryKey: qk.consistency(projectId),
    queryFn: () => api<ConsistencyEntityDTO[]>(ApiPaths.projectConsistency(projectId)),
    enabled: !!projectId,
  });
  const items = all?.filter((i) => i.type === tab);

  /** 낙관적 갱신은 부모가 캐시를 직접 고친다 — 이 저장소의 기존 패턴이다. */
  function setItems(next: (prev: ConsistencyEntityDTO[]) => ConsistencyEntityDTO[]) {
    queryClient.setQueryData<ConsistencyEntityDTO[]>(qk.consistency(projectId), (prev) =>
      next(prev ?? []),
    );
  }

  /**
   * 저장.
   *
   * @param openImages 새로 만든 항목의 참조 이미지 다이얼로그를 이어서 연다.
   *   예전에는 이 폼에 `<input type="file">` 하나뿐이라 **AI 로 참조 이미지를
   *   만드는 길이 카드에만 있었다** — 처음 등록할 때가 가장 필요한 순간인데.
   */
  async function save(e: React.FormEvent, openImages = false) {
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
        resetForm();
        if (openImages) setImageTarget(updated);
        return;
      }
      const created = await api<ConsistencyEntityDTO>(ApiPaths.projectConsistency(projectId), {
        method: 'POST',
        body: JSON.stringify({ type: tab, ...payload }),
      });
      setItems((prev) => [created, ...prev]);
      /*
       * 처음 만든 그림체는 서버가 대표로 지정한다(`ConsistencyService.create`).
       * 그 결과는 프로젝트에 남으므로 캐시를 다시 읽어야 '대표' 배지와 컷 인스펙터의
       * 기본 그림체가 따라온다.
       */
      if (tab === 'style' && !defaultStyleId) {
        void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      }
      toast.push('success', `'${created.name}'을(를) 추가했습니다.`);
      resetForm();
      if (openImages) setImageTarget(created);
    } catch (err) {
      toast.push('error', errorMessage(err, `${tabLabel}을(를) 저장`));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: `${tabLabel}을(를) 삭제할까요?`,
      body: '등록한 이미지도 함께 사라집니다. 이 항목을 쓰던 컷은 그대로 남습니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
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
    // 폼이 화면 밖이면 '수정' 을 눌러도 아무 일도 안 일어난 것처럼 보인다.
    // 폼으로 데려가고 이름 칸에 커서를 둔다.
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nameRef.current?.focus({ preventScroll: true });
  }

  function applyUpdated(next: ConsistencyEntityDTO) {
    setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  return (
    <AppShell
      breadcrumb={
        <Breadcrumb
          items={[
            { label: '대시보드', href: '/dashboard' },
            { label: project?.name ?? '…', href: `/projects/${projectId}` },
            // 에디터에서 왔을 때만 한 칸 더. 그 칸이 돌아가는 길이다.
            ...(fromPage
              ? [
                  {
                    label: pageLabel(fromPage),
                    href: `/projects/${projectId}/pages/${fromPage.id}`,
                  },
                ]
              : []),
            { label: '설정집' },
          ]}
        />
      }
    >
      <PageContainer>
        <h1 className="text-title-lg font-semibold sm:text-display-md">설정집</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          등장인물·배경·세계관은 컷 설명에서 @로 불러 씁니다. 그림체는 컷 설정에서 고릅니다. 한 번
          등록해 두면 컷이 바뀌어도 같은 모습으로 그려집니다.
        </p>

        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                resetForm();
              }}
              className={`-mb-px flex shrink-0 items-center whitespace-nowrap border-b-2 px-4 py-2 text-body-sm transition-colors touch:min-h-11 ${
                tab === t
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ENTITY_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {/*
          폼이 목록 위에 있다. 예전에는 오른쪽 사이드바였는데, md 미만에서는 그리드가
          단일 컬럼으로 접히면서 DOM 순서대로 목록 **뒤**로 갔다. 캐릭터가 8명이면
          '하나 더 추가' 하려고 2,000px 을 내려가야 했고, 카드의 '수정' 을 눌러도
          바뀌는 폼이 화면 밖이라 아무 일도 안 일어난 것처럼 보였다.
        */}
        <section
          ref={formRef}
          className="mt-8 space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <h2 className="text-body-lg font-medium">
            {editing ? `${editing.name} 수정` : `새 ${tabLabel}`}
          </h2>
          <form onSubmit={save} className="space-y-3">
            <Input
              ref={nameRef}
              required
              aria-label={`${tabLabel} 이름`}
              placeholder={`${tabLabel} 이름`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              aria-label="별칭"
              placeholder="별칭 (쉼표로 구분)"
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            />
            <textarea
              aria-label="설명"
              placeholder="생김새·성격·분위기 등을 적어 두면 그림에 반영됩니다"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-body-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {/*
              참조 이미지는 **저장한 뒤** 붙는다. AI 생성도 업로드도 서버에서 이 항목의
              id 를 쓰기 때문이다. 예전에는 이 폼에 파일 선택 하나뿐이라, AI 로 참조를
              만드는 길이 카드에만 있었다 — 처음 등록할 때가 가장 필요한 순간인데.
            */}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? '저장 중…' : editing ? '저장' : '추가'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting || !form.name.trim()}
                onClick={(e) => void save(e, true)}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {editing ? '저장하고 참조 이미지' : '추가하고 참조 이미지'}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  취소
                </Button>
              )}
            </div>
          </form>
        </section>

        <section className="mt-8 space-y-4">
          {/* 로딩과 "정말 없음" 을 구분한다. 조회 실패는 오류 경계가 받는다. */}
          {isLoading ? (
            <p className="text-body-sm text-muted-foreground">불러오는 중…</p>
          ) : items?.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="text-body-sm text-muted-foreground">
                아직 등록한 {tabLabel}이(가) 없습니다.
              </p>
              <Button
                className="mt-4"
                size="sm"
                variant="outline"
                onClick={() => {
                  resetForm();
                  formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  nameRef.current?.focus({ preventScroll: true });
                }}
              >
                {tabLabel} 추가
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {items?.map((it) => (
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

        {/* 방금 만든(또는 고른) 항목에 참조 이미지를 붙인다. 카드의 '+ 이미지' 와 같은 창. */}
        {imageTarget && (
          <EntityImageDialog
            open
            onOpenChange={(v) => {
              if (!v) setImageTarget(null);
            }}
            entityId={imageTarget.id}
            entityType={imageTarget.type}
            onUpdated={(e) => {
              applyUpdated(e);
              setImageTarget(null);
            }}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
