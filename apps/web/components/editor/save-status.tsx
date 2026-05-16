'use client';

interface Props {
  state: 'idle' | 'saving' | 'error';
  lastSavedAt?: number | null;
}

export function SaveStatus({ state, lastSavedAt }: Props) {
  if (state === 'saving') {
    return <span className="text-caption text-muted-foreground">저장 중…</span>;
  }
  if (state === 'error') {
    return <span className="text-caption text-destructive">저장 실패</span>;
  }
  if (lastSavedAt) {
    return (
      <span className="text-caption text-muted-foreground">
        저장됨 · {relativeTime(lastSavedAt)}
      </span>
    );
  }
  return null;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return '방금';
  if (diff < 60_000) return `${Math.round(diff / 1000)}초 전`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}분 전`;
  return new Date(ts).toLocaleTimeString('ko-KR');
}
