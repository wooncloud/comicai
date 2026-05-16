'use client';
import type { RenderStatus } from '@comicai/types';

const STYLES: Record<RenderStatus, { bg: string; text: string; label: string }> = {
  queued: { bg: 'bg-neutral-200 dark:bg-neutral-700', text: 'text-neutral-700 dark:text-neutral-200', label: '대기' },
  running: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', label: '생성중' },
  succeeded: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300', label: '완료' },
  failed: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300', label: '실패' },
  canceled: { bg: 'bg-neutral-200 dark:bg-neutral-700', text: 'text-neutral-500', label: '취소' },
  timeout: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-700 dark:text-orange-300', label: '타임아웃' },
};

export function PanelStatusBadge({ status }: { status: RenderStatus | null | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
        미렌더
      </span>
    );
  }
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
