'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ApiPaths, type PanelDTO, type RenderJobDTO } from '@comicai/types';
import { PanelStatusBadge } from './panel-status-badge';
import { qk } from '@/lib/query-keys';

interface Props {
  panelId: string;
  currentRenderId: string | null | undefined;
  onRestored?: (panel: PanelDTO) => void;
}

export function HistoryTray({ panelId, currentRenderId, onRestored }: Props) {
  const queryClient = useQueryClient();
  const { data: items } = useQuery<RenderJobDTO[]>({
    queryKey: qk.panelHistory(panelId),
    queryFn: () => api<RenderJobDTO[]>(ApiPaths.panelHistory(panelId)),
  });

  const restore = useMutation({
    mutationFn: (jobId: string) =>
      api<PanelDTO>(ApiPaths.renderJobRestore(jobId), { method: 'POST' }),
    onSuccess: (panel) => {
      onRestored?.(panel);
      void queryClient.invalidateQueries({ queryKey: qk.panelHistory(panelId) });
    },
  });

  if (!items)
    return <div className="text-caption text-muted-foreground">생성 기록 불러오는 중…</div>;
  if (items.length === 0) {
    return <div className="text-caption text-muted-foreground">아직 생성한 이미지가 없습니다.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-caption font-medium text-muted-foreground">
        생성 기록 ({items.length})
      </div>
      <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
        {items.map((j) => {
          const isCurrent = j.id === currentRenderId;
          const canRestore = j.status === 'succeeded' && !isCurrent;
          const isBusy = restore.isPending && restore.variables === j.id;
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
                    alt={`생성 이미지 ${j.id.slice(-6)}`}
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
                    onClick={() => restore.mutate(j.id)}
                    disabled={isBusy}
                    className="reveal-on-hover absolute inset-0 flex items-center justify-center bg-black/60 text-caption font-medium text-white disabled:pointer-events-auto disabled:opacity-100"
                  >
                    {isBusy ? '복원 중…' : '이 결과로 복원'}
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
