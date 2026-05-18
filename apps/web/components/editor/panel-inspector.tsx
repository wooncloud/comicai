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
import { PencilRuler, Brush, Sparkles, Square } from 'lucide-react';
import { PanelTextEditor } from './panel-editor';
import { PanelStatusBadge } from './panel-status-badge';
import { SectionLabel } from './section-label';
import { CollapseButton } from './collapse-button';
import { HexColorField } from './hex-color-field';
import { NumberField } from './number-field';
import { HistoryTray } from './history-tray';
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
  /** 호출 시 인스펙터를 접는다. 부재 시 토글 버튼 미노출. */
  onCollapse?: () => void;
}

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini' },
  { id: 'gpt-image-2', label: 'OpenAI' },
];

export function PanelInspector({
  projectId,
  panel,
  onPanelUpdated,
  onPanelDeleted,
  onCollapse,
}: Props) {
  const [doc, setDoc] = useState<TipTapDoc>(panel.text ?? emptyDoc());
  // null이면 프로젝트 대표 모델(없으면 Gemini)을 사용.
  const [userModel, setUserModel] = useState<ModelId | null>(null);
  const [contiDialogOpen, setContiDialogOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(panel.currentRenderId ?? null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const esRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

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
              // 백엔드 워커가 렌더 성공 시 panel.conti를 null화 하므로 클라이언트도 동기화.
              patchRender({
                currentRenderStatus: 'succeeded',
                currentRenderImageUrl: j.resultImageUrl ?? null,
                conti: null,
                contiUrl: null,
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
    try {
      await api(ApiPaths.panel(panel.id), { method: 'DELETE' });
      onPanelDeleted();
      toast.push('success', '패널이 삭제되었습니다.');
    } catch (err) {
      toast.push('error', (err as Error).message || '삭제에 실패했습니다.');
    }
  }

  return (
    <aside className="flex min-h-0 w-96 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="인스펙터 접기" />}
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          패널 · {panel.id.slice(-8)}
        </div>
        <PanelStatusBadge status={status} />
      </div>

      <PanelTextEditor
        projectId={projectId}
        initial={doc}
        onChange={setDoc}
        onSubmit={() => {
          // 진행 중이거나 mutation pending이면 무시.
          if (status === 'queued' || status === 'running' || startRender.isPending) return;
          startRender.mutate();
        }}
      />

      <PanelStrokeEditor
        shape={panel.shape}
        onChange={async (next) => {
          try {
            const updated = await api<PanelDTO>(ApiPaths.panel(panel.id), {
              method: 'PATCH',
              body: JSON.stringify({ shape: next }),
            });
            onPanelUpdated(updated);
          } catch (err) {
            if (err instanceof ApiError) toast.push('error', `저장 실패: ${err.code}`);
          }
        }}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel icon={PencilRuler}>콘티 (구도 스케치)</SectionLabel>
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

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-caption text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel icon={Brush}>
          그림체
          {panel.styleId == null && project?.defaultStyleId && (
            <span className="ml-1 text-caption font-normal text-muted-foreground">
              (프로젝트 대표)
            </span>
          )}
        </SectionLabel>
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
        <SectionLabel icon={Sparkles}>모델</SectionLabel>
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

      <div className="mt-auto border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          패널 삭제
        </Button>
      </div>
    </aside>
  );
}

function PanelStrokeEditor({
  shape,
  onChange,
}: {
  shape: PanelShape;
  onChange: (next: PanelShape) => void | Promise<void>;
}) {
  const color = shape.strokeColor ?? '#000000';
  const width = shape.strokeWidth ?? 2;

  function commitColor(next: string) {
    if (next === shape.strokeColor) return;
    void onChange({ ...shape, strokeColor: next });
  }
  function commitWidth(next: number) {
    if (next === shape.strokeWidth) return;
    void onChange({ ...shape, strokeWidth: next });
  }

  return (
    <div className="space-y-2">
      <SectionLabel icon={Square}>패널 선</SectionLabel>
      <div className="flex items-center gap-2">
        <HexColorField
          value={color}
          onCommit={commitColor}
          ariaLabel="패널 선 색"
          variant="panel"
        />
        <NumberField
          value={width}
          min={0}
          max={20}
          step={1}
          onCommit={commitWidth}
          ariaLabel="패널 선 굵기 (px)"
        />
        <span className="text-caption text-muted-foreground">px</span>
      </div>
    </div>
  );
}
