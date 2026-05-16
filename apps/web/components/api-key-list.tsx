'use client';
import { useState } from 'react';
import type { ApiKeySummary } from '@comicai/types';
import { Button } from '@/components/ui/button';

interface Props {
  items: ApiKeySummary[];
  onDelete: (id: string) => Promise<void>;
  onVerify: (id: string) => Promise<void>;
}

export function ApiKeyList({ items, onDelete, onVerify }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">등록된 키가 없습니다.</p>;
  }

  async function handleVerify(id: string) {
    setBusyId(id);
    try {
      await onVerify(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((k) => (
        <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
                {k.provider}
              </span>
              <span className="truncate font-medium">{k.label}</span>
              <StatusBadge active={k.isActive} verifiedAt={k.lastVerifiedAt} />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              등록 {new Date(k.createdAt).toLocaleString('ko-KR')}
              {k.lastVerifiedAt && (
                <> · 마지막 검증 {new Date(k.lastVerifiedAt).toLocaleString('ko-KR')}</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === k.id}
              onClick={() => handleVerify(k.id)}
            >
              {busyId === k.id ? '검증 중…' : '검증'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm(`"${k.label}" 키를 삭제하시겠습니까?`)) onDelete(k.id);
              }}
            >
              삭제
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ active, verifiedAt }: { active: boolean; verifiedAt: string | null }) {
  if (!active) {
    return (
      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
        비활성
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
      {verifiedAt ? '검증됨' : '미검증'}
    </span>
  );
}
