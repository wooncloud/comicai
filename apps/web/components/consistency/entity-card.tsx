'use client';
import { useState } from 'react';
import { type ConsistencyEntityDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { ImageViewer, useImageViewer } from '@/components/ui/image-viewer';
import { EntityImageDialog } from './entity-image-dialog';

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const viewer = useImageViewer();

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
            <p className="text-caption text-muted-foreground">별칭: {entity.aliases.join(', ')}</p>
          )}
        </div>
      </header>

      {entity.description && (
        <p className="line-clamp-2 text-body-sm text-muted-foreground">{entity.description}</p>
      )}

      <ImageStrip entity={entity} onOpen={viewer.open} />

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
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          + 이미지
        </Button>
      </div>

      <ImageViewer
        urls={entity.refImageUrls}
        index={viewer.index}
        onIndexChange={viewer.setIndex}
        label={`${entity.name} 참조 이미지`}
      />

      <EntityImageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entityId={entity.id}
        entityType={entity.type}
        onUpdated={onUpdated}
      />
    </article>
  );
}

/**
 * 참조 이미지를 한 줄로 접어 보여 준다.
 *
 * 예전에는 3~4열 정사각 그리드라 이미지가 6장이면 카드 높이의 절반이 그림이었다.
 * 목록은 훑어보는 화면이라 카드 하나가 화면을 다 먹으면 비교가 안 된다.
 *
 * 그리고 썸네일이 `<a target="_blank">` 였다. 모바일에서는 앱을 벗어나 presigned URL
 * 만 떠 있는 화면으로 넘어갔다. 이제 눌러서 뷰어로 크게 본다.
 */
function ImageStrip({
  entity,
  onOpen,
}: {
  entity: ConsistencyEntityDTO;
  onOpen: (index: number) => void;
}) {
  if (entity.refImages.length === 0) {
    return <p className="text-caption text-muted-foreground">참조 이미지 없음</p>;
  }

  // 한 줄에 들어갈 만큼만 펼치고 나머지는 개수로 접는다.
  const VISIBLE = 5;
  const shown = entity.refImages.slice(0, VISIBLE);
  const hidden = entity.refImages.length - shown.length;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {shown.map((img, i) => {
        const url = entity.refImageUrls[i];
        return (
          <li key={img.storageKey}>
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`참조 이미지 ${i + 1} 크게 보기`}
              className="block h-12 w-12 overflow-hidden rounded-md border border-border bg-muted outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-caption text-muted-foreground">
                  {i + 1}
                </span>
              )}
            </button>
          </li>
        );
      })}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={() => onOpen(VISIBLE)}
            aria-label={`나머지 참조 이미지 ${hidden}장 보기`}
            className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-caption text-muted-foreground outline-none transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{hidden}
          </button>
        </li>
      )}
    </ul>
  );
}
