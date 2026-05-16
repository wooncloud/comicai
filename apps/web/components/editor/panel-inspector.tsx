'use client';
import { useEffect, useRef, useState } from 'react';
import { api, API_BASE, ApiError } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import {
  ApiPaths,
  emptyDoc,
  type PanelDTO,
  type PanelShape,
  type PanelShapeType,
  type RenderJobDTO,
  type RenderStatus,
  type TipTapDoc,
  type ModelId,
} from '@comicai/types';
import { PanelTextEditor } from './panel-editor';
import { PanelStatusBadge } from './panel-status-badge';
import { HistoryTray } from './history-tray';
import { PanelShapePicker } from './panel-shape-picker';
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
  { id: 'gemini-nano-banana', label: 'Gemini' },
  { id: 'gpt-image-1', label: 'OpenAI' },
];

export function PanelInspector({ projectId, panel, onPanelUpdated, onPanelDeleted }: Props) {
  const [doc, setDoc] = useState<TipTapDoc>(panel.text ?? emptyDoc());
  const [status, setStatus] = useState<RenderStatus | null>(null);
  const [model, setModel] = useState<ModelId>('gemini-nano-banana');
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const toast = useToast();
  // SSE 핸들러가 항상 최신 panel/콜백을 보도록 ref로 보관.
  const panelRef = useRef(panel);
  const onPanelUpdatedRef = useRef(onPanelUpdated);
  const esRef = useRef<EventSource | null>(null);
  panelRef.current = panel;
  onPanelUpdatedRef.current = onPanelUpdated;

  function patchRender(patch: Partial<PanelDTO>) {
    onPanelUpdatedRef.current({ ...panelRef.current, ...patch });
  }

  useEffect(() => {
    setDoc(panel.text ?? emptyDoc());
    setError(null);
    if (panel.currentRenderId) {
      api<RenderJobDTO>(ApiPaths.renderJob(panel.currentRenderId))
        .then((j) => {
          setStatus(j.status);
          setResultImageUrl(j.resultImageUrl ?? null);
        })
        .catch(() => {});
    } else {
      setStatus(null);
      setResultImageUrl(null);
    }
  }, [panel.id, panel.currentRenderId]);

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

  async function startRender() {
    setError(null);
    setResultImageUrl(null);
    try {
      const { jobId } = await api<{ jobId: string }>(ApiPaths.panelRender(panel.id), {
        method: 'POST',
        body: JSON.stringify({ model }),
      });
      setStatus('queued');
      patchRender({ currentRenderStatus: 'queued' });
      subscribeJob(jobId);
    } catch (err) {
      if (err instanceof ApiError) setError(`렌더 시작 실패: ${err.code}`);
    }
  }

  function subscribeJob(jobId: string) {
    esRef.current?.close();
    const es = new EventSource(`${API_BASE}${ApiPaths.renderJobEvents(jobId)}`, {
      withCredentials: true,
    });
    esRef.current = es;
    es.addEventListener('status', (e) => {
      try {
        const { status: next } = JSON.parse((e as MessageEvent).data) as { status: RenderStatus };
        setStatus(next);
        if (next === 'succeeded') {
          // 후속 GET이 status+URL을 한 번에 푸시하므로 여기선 panel 갱신 생략.
          api<RenderJobDTO>(ApiPaths.renderJob(jobId))
            .then((j) => {
              setResultImageUrl(j.resultImageUrl ?? null);
              patchRender({
                currentRenderStatus: 'succeeded',
                currentRenderImageUrl: j.resultImageUrl ?? null,
              });
            })
            .catch(() => {});
          toast.push('success', '렌더 완료');
          setHistoryKey((k) => k + 1);
          es.close();
          esRef.current = null;
        } else if (next === 'failed' || next === 'canceled') {
          patchRender({ currentRenderStatus: next });
          toast.push('error', next === 'failed' ? '렌더 실패' : '렌더 취소됨');
          setHistoryKey((k) => k + 1);
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
        value={(panel.shape.type ?? 'rect') as PanelShapeType}
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
        <label className="block text-caption text-muted-foreground">모델</label>
        <Select value={model} onValueChange={(v) => setModel(v as ModelId)}>
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
          onClick={startRender}
          disabled={status === 'queued' || status === 'running'}
          className="w-full"
        >
          {status === 'queued' || status === 'running' ? '생성 중…' : '생성하기'}
        </Button>
      </div>

      <HistoryTray
        panelId={panel.id}
        currentRenderId={panel.currentRenderId}
        refreshKey={historyKey}
        onRestored={(p) => {
          onPanelUpdated(p);
          setResultImageUrl(p.currentRenderImageUrl ?? null);
          setHistoryKey((k) => k + 1);
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
