'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ApiPaths, type PanelDTO, type RenderJobDTO } from '@comicai/types';
import { PanelStatusBadge } from './panel-status-badge';
import { qk } from '@/lib/query-keys';
import { MODEL_LABEL } from '@/lib/model-options';

interface Props {
  panelId: string;
  currentRenderId: string | null | undefined;
  onRestored?: (panel: PanelDTO) => void;
}

export function HistoryTray({ panelId, currentRenderId, onRestored }: Props) {
  const queryClient = useQueryClient();
  const { data: items, isError } = useQuery<RenderJobDTO[]>({
    queryKey: qk.panelHistory(panelId),
    queryFn: () => api<RenderJobDTO[]>(ApiPaths.panelHistory(panelId)),
    // 에디터는 오류 경계로 던지지 않는다 — 라우트가 교체되면 캔버스가 언마운트되고
    // 디바운스 중인 편집이 사라진다. 기록은 이 트레이 안에서만 실패를 말한다.
    throwOnError: false,
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
                    className="reveal-on-hover absolute inset-0 flex items-center justify-center bg-black/60 text-caption font-medium text-white disabled:opacity-100"
                  >
                    {isBusy ? '복원 중…' : '이 결과로 복원'}
                  </button>
                )}
              </div>
              {/*
                예전에는 job id 6자리와 모델 ID 원문('gemini-3.1-flash-image-preview')이
                그대로 찍혔다. 둘 다 사용자가 고른 적 없는 내부 값이고, 정작 그 모델을
                고른 화면에서는 'Gemini' 라는 이름으로 보여 준다.
              */}
              <div
                className="truncate border-t border-border bg-card px-2 py-1 text-[10px] text-muted-foreground"
                title={`${new Date(j.createdAt).toLocaleString('ko-KR')} · ${MODEL_LABEL[j.model] ?? j.model}`}
              >
                {new Date(j.createdAt).toLocaleDateString('ko-KR')} ·{' '}
                {MODEL_LABEL[j.model] ?? j.model}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
