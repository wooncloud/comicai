'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ApiPaths, type PanelDTO, type RenderJobDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { PanelStatusBadge } from './panel-status-badge';

interface Props {
  panelId: string;
  currentRenderId: string | null | undefined;
  refreshKey?: unknown;
  onRestored?: (panel: PanelDTO) => void;
}

export function HistoryTray({ panelId, currentRenderId, refreshKey, onRestored }: Props) {
  const [items, setItems] = useState<RenderJobDTO[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api<RenderJobDTO[]>(ApiPaths.panelHistory(panelId))
      .then(setItems)
      .catch(() => setItems([]));
  }, [panelId, refreshKey]);

  async function restore(jobId: string) {
    setBusyId(jobId);
    try {
      const panel = await api<PanelDTO>(ApiPaths.renderJobRestore(jobId), { method: 'POST' });
      onRestored?.(panel);
    } finally {
      setBusyId(null);
    }
  }

  if (!items) return <div className="text-caption text-muted-foreground">히스토리 로딩…</div>;
  if (items.length === 0) {
    return <div className="text-caption text-muted-foreground">렌더 기록이 없습니다.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-caption font-medium text-muted-foreground">
        히스토리 ({items.length})
      </div>
      <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
        {items.map((j) => {
          const isCurrent = j.id === currentRenderId;
          const canRestore = j.status === 'succeeded' && !isCurrent;
          return (
            <li
              key={j.id}
              className={`group relative overflow-hidden rounded-md border ${
                isCurrent ? 'border-foreground/60 ring-1 ring-foreground/20' : 'border-border'
              }`}
            >
              <div className="relative aspect-square bg-muted">
                {j.resultImageUrl ? (
                  <img
                    src={j.resultImageUrl}
                    alt={`render ${j.id.slice(-6)}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-caption text-muted-foreground">
                    {j.status}
                  </div>
                )}
                <div className="absolute left-1 top-1">
                  <PanelStatusBadge status={j.status} />
                </div>
                {isCurrent && (
                  <div className="absolute right-1 top-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                    현재
                  </div>
                )}
                {canRestore && (
                  <button
                    onClick={() => restore(j.id)}
                    disabled={busyId === j.id}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 text-caption font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                  >
                    {busyId === j.id ? '복원 중…' : '이 결과로 복원'}
                  </button>
                )}
              </div>
              <div className="border-t border-border bg-card px-2 py-1 text-[10px] text-muted-foreground">
                <span className="font-mono">{j.id.slice(-6)}</span>
                <span> · {j.model}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
