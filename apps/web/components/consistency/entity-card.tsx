'use client';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type ConsistencyEntityDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';

interface Props {
  entity: ConsistencyEntityDTO;
  onUpdated: (e: ConsistencyEntityDTO) => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function EntityCard({ entity, onUpdated, onEdit, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api<ConsistencyEntityDTO>(ApiPaths.consistencyImages(entity.id), {
        method: 'POST',
        body: fd,
        headers: {}, // 다중부분은 brower가 boundary 자동 설정 — content-type 덮어쓰지 않기.
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? `업로드 실패: ${err.code}` : '업로드 실패');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body-lg font-medium">{entity.name}</h3>
          {entity.aliases.length > 0 && (
            <p className="text-caption text-muted-foreground">alias: {entity.aliases.join(', ')}</p>
          )}
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-caption">
          v{entity.version}
        </span>
      </header>

      {entity.description && (
        <p className="line-clamp-2 text-body-sm text-muted-foreground">{entity.description}</p>
      )}

      <ImageGrid entity={entity} />

      {error && <p className="text-caption text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            수정
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
            삭제
          </Button>
        </div>
        <label className="cursor-pointer">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />
          <span className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-body-sm hover:bg-accent">
            {uploading ? '업로드 중…' : '+ 이미지'}
          </span>
        </label>
      </div>
    </article>
  );
}

function ImageGrid({ entity }: { entity: ConsistencyEntityDTO }) {
  if (entity.refImages.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-caption text-muted-foreground">
        참조 이미지 없음
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {entity.refImages.map((img, i) => (
        <li
          key={img.storageKey}
          className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
          title={`참조 ${i + 1}`}
        >
          {/* presigned download endpoint은 추후 P6에서 통합 — 일단 storage key만 표시 */}
          <div className="flex h-full w-full items-center justify-center text-caption text-muted-foreground">
            <span>#{i + 1}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
