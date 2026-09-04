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
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">등록된 키가 없습니다.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((k) => (
        <ApiKeyRow key={k.id} item={k} onDelete={onDelete} onVerify={onVerify} />
      ))}
    </ul>
  );
}

function ApiKeyRow({
  item,
  onDelete,
  onVerify,
}: {
  item: ApiKeySummary;
  onDelete: (id: string) => Promise<void>;
  onVerify: (id: string) => Promise<void>;
}) {
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    try {
      await onVerify(item.id);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-body-sm">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-caption text-secondary-foreground">
            {item.provider}
          </span>
          <span className="min-w-0 truncate font-medium">{item.label}</span>
          <StatusBadge active={item.isActive} verifiedAt={item.lastVerifiedAt} />
        </div>
        {/*
          예전에는 등록·마지막 검증 시각을 둘 다 초 단위(toLocaleString)로 찍어서,
          390px 에서 이 줄만 2~3줄을 차지하고 정작 사용자가 붙인 라벨은 다섯 글자쯤에서
          잘렸다. 검증 여부는 위 배지가 이미 말하고 있어 중복이기도 했다.
        */}
        <div className="mt-0.5 text-caption text-muted-foreground">
          {new Date(item.createdAt).toLocaleDateString('ko-KR')} 등록
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={verifying} onClick={handleVerify}>
          {verifying ? '검증 중…' : '검증'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`"${item.label}" 키를 삭제하시겠습니까?`)) void onDelete(item.id);
          }}
        >
          삭제
        </Button>
      </div>
    </li>
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
