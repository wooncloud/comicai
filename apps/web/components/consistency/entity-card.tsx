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
  /** style 탭에서만 의미가 있음 — 현재 대표 그림체 여부. */
  isDefault?: boolean;
  /** style 탭에서만 의미가 있음 — 클릭 시 대표 그림체로 지정. */
  onSetDefault?: () => void | Promise<void>;
}

export function EntityCard({
  entity,
  onUpdated,
  onEdit,
  onRemove,
  isDefault,
  onSetDefault,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const updated = await api<ConsistencyEntityDTO>(ApiPaths.consistencyImages(entity.id), {
        method: 'POST',
        body: fd,
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
          <h3 className="flex items-center gap-2 truncate text-body-lg font-medium">
            <span className="truncate">{entity.name}</span>
            {isDefault && (
              <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-caption font-medium text-background">
                대표
              </span>
            )}
          </h3>
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
          {onSetDefault && !isDefault && (
            <Button size="sm" variant="ghost" onClick={() => void onSetDefault()}>
              대표로 지정
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
            삭제
          </Button>
        </div>
        <label className="cursor-pointer">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
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
      {entity.refImages.map((img, i) => {
        const url = entity.refImageUrls[i];
        return (
          <li
            key={img.storageKey}
            className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
            title={`참조 ${i + 1}`}
          >
            {url ? (
              <a href={url} target="_blank" rel="noopener" className="block h-full w-full">
                <img
                  src={url}
                  alt={`참조 ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-caption text-muted-foreground">
                #{i + 1}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
