'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE, ApiError } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import {
  ApiPaths,
  emptyDoc,
  type ConsistencyEntityDTO,
  type PanelDTO,
  type PanelShape,
  type ProjectDTO,
  type RenderJobDTO,
  type RenderStatus,
  type TipTapDoc,
  type ModelId,
} from '@comicai/types';
import { PanelTextEditor } from './panel-editor';
import { PanelStatusBadge } from './panel-status-badge';
import { HistoryTray } from './history-tray';
import { PanelShapePicker } from './panel-shape-picker';
import { ContiDialog } from './conti-dialog';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  projectId: string;
  panel: PanelDTO;
  onPanelUpdated: (p: PanelDTO) => void;
  onPanelDeleted: () => void;
}

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini' },
  { id: 'gpt-image-2', label: 'OpenAI' },
];

export function PanelInspector({ projectId, panel, onPanelUpdated, onPanelDeleted }: Props) {
  // 부모(page editor)가 key={panel.id}로 마운트해 panel.id는 한 인스턴스 안에서 불변.
  const [doc, setDoc] = useState<TipTapDoc>(panel.text ?? emptyDoc());
  // 사용자가 직접 고른 모델. null이면 프로젝트 대표 모델(없으면 Gemini)을 사용.
  const [userModel, setUserModel] = useState<ModelId | null>(null);
  const [contiDialogOpen, setContiDialogOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(panel.currentRenderId ?? null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const esRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  // activeJobId가 바뀌면 새 잡 상태를 추적. panel.currentRenderId가 외부에서 바뀌면 sync.
  useEffect(() => {
    setActiveJobId(panel.currentRenderId ?? null);
  }, [panel.currentRenderId]);

  const { data: job } = useQuery<RenderJobDTO>({
    queryKey: ['render-job', activeJobId],
    queryFn: () => api<RenderJobDTO>(ApiPaths.renderJob(activeJobId!)),
    enabled: !!activeJobId,
  });

  // 프로젝트 대표 그림체와 등록된 style 엔티티 목록.
  const { data: project } = useQuery<ProjectDTO>({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectDTO>(ApiPaths.project(projectId)),
  });
  const { data: styles } = useQuery<ConsistencyEntityDTO[]>({
    queryKey: ['consistency', projectId, 'style'],
    queryFn: () =>
      api<ConsistencyEntityDTO[]>(`${ApiPaths.projectConsistency(projectId)}?type=style`),
  });
  const effectiveStyleId = panel.styleId ?? project?.defaultStyleId ?? null;
  const model: ModelId = userModel ?? project?.defaultModel ?? 'gemini-3.1-flash-image-preview';
  const status: RenderStatus | null = job?.status ?? null;
  const resultImageUrl = job?.resultImageUrl ?? null;

  function patchRender(patch: Partial<PanelDTO>) {
    onPanelUpdated({ ...panel, ...patch });
  }

  useEffect(() => () => esRef.current?.close(), []);

  useDebounced(doc, 800, async (next) => {
    try {
      const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
        method: 'PATCH',
        body: JSON.stringify({ text: next }),
      });
      onPanelUpdated(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`저장 실패: ${err.code}`);
        toast.push('error', `저장 실패: ${err.code}`);
      }
    }
  });

  const startRender = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>(ApiPaths.panelRender(panel.id), {
        method: 'POST',
        body: JSON.stringify({ model }),
      }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: ({ jobId }) => {
      setActiveJobId(jobId);
      queryClient.setQueryData<RenderJobDTO>(['render-job', jobId], (prev) => ({
        ...(prev ?? ({} as RenderJobDTO)),
        id: jobId,
        status: 'queued',
        resultImageUrl: null,
      }));
      patchRender({ currentRenderStatus: 'queued' });
      subscribeJob(jobId);
    },
    onError: (err) => {
      if (err instanceof ApiError) setError(`렌더 시작 실패: ${err.code}`);
    },
  });

  function subscribeJob(jobId: string) {
    esRef.current?.close();
    const es = new EventSource(`${API_BASE}${ApiPaths.renderJobEvents(jobId)}`, {
      withCredentials: true,
    });
    esRef.current = es;
    es.addEventListener('status', (e) => {
      try {
        const { status: next } = JSON.parse(e.data) as { status: RenderStatus };
        queryClient.setQueryData<RenderJobDTO>(['render-job', jobId], (prev) =>
          prev ? { ...prev, status: next } : ({ id: jobId, status: next } as RenderJobDTO),
        );
        if (next === 'succeeded') {
          api<RenderJobDTO>(ApiPaths.renderJob(jobId))
            .then((j) => {
              queryClient.setQueryData<RenderJobDTO>(['render-job', jobId], j);
              patchRender({
                currentRenderStatus: 'succeeded',
                currentRenderImageUrl: j.resultImageUrl ?? null,
              });
            })
            .catch(() => {});
          toast.push('success', '렌더 완료');
          void queryClient.invalidateQueries({ queryKey: ['panel-history', panel.id] });
          es.close();
          esRef.current = null;
        } else if (next === 'failed' || next === 'canceled') {
          patchRender({ currentRenderStatus: next });
          toast.push('error', next === 'failed' ? '렌더 실패' : '렌더 취소됨');
          void queryClient.invalidateQueries({ queryKey: ['panel-history', panel.id] });
          es.close();
          esRef.current = null;
        } else {
          patchRender({ currentRenderStatus: next });
        }
      } catch {}
    });
    es.addEventListener('error', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { error: { message: string } };
        setError(payload.error.message);
      } catch {}
    });
  }

  async function onDelete() {
    if (!confirm('패널을 삭제하시겠습니까?')) return;
    await api(ApiPaths.panel(panel.id), { method: 'DELETE' });
    onPanelDeleted();
  }

  return (
    <aside className="flex w-96 flex-col gap-4 border-l border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">패널 {panel.id.slice(-8)}</div>
        <PanelStatusBadge status={status} />
      </div>

      <PanelTextEditor projectId={projectId} initial={doc} onChange={setDoc} />

      <PanelShapePicker
        value={panel.shape.type ?? 'rect'}
        onChange={async (variant) => {
          if (variant === panel.shape.type) return;
          try {
            const nextShape: PanelShape = { ...panel.shape, type: variant };
            const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
              method: 'PATCH',
              body: JSON.stringify({ shape: nextShape }),
            });
            onPanelUpdated(updated);
          } catch (err) {
            if (err instanceof ApiError) toast.push('error', `저장 실패: ${err.code}`);
          }
        }}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-caption text-muted-foreground">콘티 (구도 스케치)</label>
          {panel.conti && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm('콘티를 제거하시겠습니까?')) return;
                try {
                  const updated = await api<PanelDTO>(ApiPaths.panelConti(panel.id), {
                    method: 'DELETE',
                  });
                  onPanelUpdated(updated);
                } catch (err) {
                  if (err instanceof ApiError) toast.push('error', `삭제 실패: ${err.code}`);
                }
              }}
              className="text-caption text-destructive hover:underline"
            >
              제거
            </button>
          )}
        </div>
        {panel.contiUrl ? (
          <button
            type="button"
            onClick={() => setContiDialogOpen(true)}
            className="block w-full overflow-hidden rounded-md border border-border bg-card transition hover:border-foreground/40"
            title="콘티 변경"
          >
            <img
              src={panel.contiUrl}
              alt="콘티"
              className="block h-auto w-full bg-white object-contain"
            />
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setContiDialogOpen(true)}
            className="w-full"
          >
            + 콘티 추가
          </Button>
        )}
      </div>

      {contiDialogOpen && (
        <ContiDialog
          open={contiDialogOpen}
          onClose={() => setContiDialogOpen(false)}
          width={1024}
          height={1024}
          onSubmit={async (file) => {
            const fd = new FormData();
            fd.append('file', file);
            try {
              const updated = await api<PanelDTO>(ApiPaths.panelConti(panel.id), {
                method: 'POST',
                body: fd,
              });
              onPanelUpdated(updated);
              toast.push('success', '콘티가 첨부되었습니다.');
            } catch (err) {
              toast.push('error', (err as Error).message || '업로드 실패');
              throw err;
            }
          }}
        />
      )}

      {resultImageUrl && (
        <a
          href={resultImageUrl}
          target="_blank"
          rel="noopener"
          className="block overflow-hidden rounded-md border border-border bg-card"
          title="원본 보기"
        >
          <img src={resultImageUrl} alt="렌더 결과" className="block h-auto w-full object-cover" />
        </a>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-caption text-muted-foreground">
          그림체
          {panel.styleId == null && project?.defaultStyleId && (
            <span className="ml-1 text-foreground/60">(프로젝트 대표)</span>
          )}
        </label>
        <Select
          value={effectiveStyleId ?? '__none__'}
          onValueChange={async (v) => {
            const next = v === '__none__' ? null : v;
            try {
              const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
                method: 'PATCH',
                body: JSON.stringify({ styleId: next }),
              });
              onPanelUpdated(updated);
            } catch (err) {
              if (err instanceof ApiError) toast.push('error', `저장 실패: ${err.code}`);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="그림체 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">(없음)</SelectItem>
            {(styles ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.id === project?.defaultStyleId ? ' · 대표' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="block text-caption text-muted-foreground">모델</label>
        <Select value={model} onValueChange={(v) => setUserModel(v as ModelId)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => startRender.mutate()}
          disabled={status === 'queued' || status === 'running' || startRender.isPending}
          className="w-full"
        >
          {status === 'queued' || status === 'running' ? '생성 중…' : '생성하기'}
        </Button>
      </div>

      <HistoryTray
        panelId={panel.id}
        currentRenderId={panel.currentRenderId}
        onRestored={(p) => {
          onPanelUpdated(p);
        }}
      />

      <div className="mt-auto">
        <button onClick={onDelete} className="text-xs text-red-600 underline">
          패널 삭제
        </button>
      </div>
    </aside>
  );
}
