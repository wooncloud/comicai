'use client';
import { useEffect, useState } from 'react';
import { api, API_BASE, ApiError } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import {
  ApiPaths,
  emptyDoc,
  type PanelDTO,
  type RenderJobDTO,
  type RenderStatus,
  type TipTapDoc,
  type ModelId,
} from '@comicai/types';
import { PanelTextEditor } from './panel-editor';
import { PanelStatusBadge } from './panel-status-badge';
import { HistoryTray } from './history-tray';
import { useToast } from '@/components/ui/toast';

interface Props {
  projectId: string;
  panel: PanelDTO;
  onPanelUpdated: (p: PanelDTO) => void;
  onPanelDeleted: () => void;
}

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'mock', label: 'Mock (테스트)' },
  { id: 'gemini-nano-banana', label: 'Gemini' },
  { id: 'gpt-image-1', label: 'OpenAI' },
];

export function PanelInspector({ projectId, panel, onPanelUpdated, onPanelDeleted }: Props) {
  const [doc, setDoc] = useState<TipTapDoc>(panel.text ?? emptyDoc());
  const [status, setStatus] = useState<RenderStatus | null>(null);
  const [model, setModel] = useState<ModelId>('mock');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    setDoc(panel.text ?? emptyDoc());
    setError(null);
    if (panel.currentRenderId) {
      api<RenderJobDTO>(ApiPaths.renderJob(panel.currentRenderId))
        .then((j) => {
          setStatus(j.status);
          setResultImage(j.resultImage?.storageKey ?? null);
        })
        .catch(() => {});
    } else {
      setStatus(null);
      setResultImage(null);
    }
  }, [panel.id]);

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
    setResultImage(null);
    try {
      const { jobId } = await api<{ jobId: string }>(ApiPaths.panelRender(panel.id), {
        method: 'POST',
        body: JSON.stringify({ model }),
      });
      setStatus('queued');
      subscribeJob(jobId);
    } catch (err) {
      if (err instanceof ApiError) setError(`렌더 시작 실패: ${err.code}`);
    }
  }

  function subscribeJob(jobId: string) {
    const es = new EventSource(`${API_BASE}${ApiPaths.renderJobEvents(jobId)}`, {
      withCredentials: true,
    });
    es.addEventListener('status', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          status: RenderStatus;
          resultImage?: { storageKey: string };
        };
        setStatus(payload.status);
        if (payload.resultImage) setResultImage(payload.resultImage.storageKey);
        if (payload.status === 'succeeded') {
          toast.push('success', '렌더 완료');
          setHistoryKey((k) => k + 1);
          es.close();
        } else if (payload.status === 'failed' || payload.status === 'canceled') {
          toast.push('error', payload.status === 'failed' ? '렌더 실패' : '렌더 취소됨');
          setHistoryKey((k) => k + 1);
          es.close();
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

      {resultImage && (
        <div className="rounded-md border border-neutral-200 bg-white p-2 text-xs dark:border-neutral-800 dark:bg-neutral-950">
          <div className="font-medium">결과 이미지</div>
          <div className="mt-1 break-all font-mono text-neutral-500">{resultImage}</div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs text-neutral-600">모델</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as ModelId)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={startRender}
          disabled={status === 'queued' || status === 'running'}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {status === 'queued' || status === 'running' ? '생성 중…' : '생성하기'}
        </button>
      </div>

      <HistoryTray
        panelId={panel.id}
        currentRenderId={panel.currentRenderId}
        refreshKey={historyKey}
        onRestored={(p) => {
          onPanelUpdated(p);
          setResultImage(p.currentRenderId ?? null);
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
