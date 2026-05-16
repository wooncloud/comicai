'use client';
import type { ApiKeySummary } from '@comicai/types';

interface Props {
  items: ApiKeySummary[];
  onDelete: (id: string) => Promise<void>;
}

export function ApiKeyList({ items, onDelete }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">등록된 키가 없습니다.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {items.map((k) => (
        <li key={k.id} className="flex items-center justify-between px-4 py-3 text-sm">
          <div>
            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-mono dark:bg-neutral-800">
              {k.provider}
            </span>
            <span className="ml-2 font-medium">{k.label}</span>
            <span className="ml-3 text-xs text-neutral-500">
              {new Date(k.createdAt).toLocaleString('ko-KR')}
            </span>
          </div>
          <button
            onClick={() => {
              if (confirm(`"${k.label}" 키를 삭제하시겠습니까?`)) onDelete(k.id);
            }}
            className="text-xs text-red-600 hover:underline"
          >
            삭제
          </button>
        </li>
      ))}
    </ul>
  );
}
