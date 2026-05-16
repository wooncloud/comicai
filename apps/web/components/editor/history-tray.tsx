'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { RenderJobDTO } from '@comicai/types';
import { PanelStatusBadge } from './panel-status-badge';

interface Props {
  panelId: string;
  currentRenderId: string | null | undefined;
  /** 외부에서 새 렌더가 끝났을 때 등 강제 새로고침 트리거 */
  refreshKey?: unknown;
}

export function HistoryTray({ panelId, currentRenderId, refreshKey }: Props) {
  const [items, setItems] = useState<RenderJobDTO[] | null>(null);

  useEffect(() => {
    api<RenderJobDTO[]>(`/panels/${panelId}/history`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [panelId, refreshKey]);

  if (!items) return <div className="text-xs text-neutral-500">히스토리 로딩…</div>;
  if (items.length === 0) {
    return <div className="text-xs text-neutral-500">렌더 기록이 없습니다.</div>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-neutral-600">히스토리 ({items.length})</div>
      <ul className="max-h-40 overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        {items.map((j) => (
          <li
            key={j.id}
            className={`flex items-center justify-between border-b border-neutral-100 px-2 py-1.5 text-xs last:border-0 dark:border-neutral-900 ${
              j.id === currentRenderId ? 'bg-blue-50 dark:bg-blue-950' : ''
            }`}
          >
            <span className="font-mono text-neutral-500">{j.id.slice(-8)}</span>
            <span className="text-neutral-500">{j.model}</span>
            <PanelStatusBadge status={j.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
