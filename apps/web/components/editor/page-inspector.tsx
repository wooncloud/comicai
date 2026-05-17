'use client';
import { Ruler, Palette } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type PageDTO } from '@comicai/types';
import { PageSizeSelect } from './page-size-select';
import { SectionLabel } from './section-label';
import { CollapseButton } from './collapse-button';
import { HexColorField } from './hex-color-field';
import { useToast } from '@/components/ui/toast';

interface Props {
  page: PageDTO;
  onPageUpdated: (page: PageDTO) => void;
  /** 호출 시 인스펙터를 접는다. */
  onCollapse?: () => void;
}

/**
 * 패널이 선택되지 않았을 때 우측에 노출되는 페이지 단위 인스펙터.
 * 페이지 크기와 배경색을 편집한다.
 */
export function PageInspector({ page, onPageUpdated, onCollapse }: Props) {
  const toast = useToast();
  const currentColor = page.backgroundColor ?? '#ffffff';
  const hasColor = !!page.backgroundColor;

  async function patch(body: { size?: { w: number; h: number }; backgroundColor?: string | null }) {
    // 옵티미스틱
    const optimistic: PageDTO = {
      ...page,
      ...('size' in body && body.size ? { size: body.size } : null),
      ...('backgroundColor' in body ? { backgroundColor: body.backgroundColor ?? null } : null),
    };
    onPageUpdated(optimistic);
    try {
      const updated = await api<PageDTO>(ApiPaths.page(page.id), {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onPageUpdated(updated);
    } catch (err) {
      if (err instanceof ApiError) toast.push('error', `저장 실패: ${err.code}`);
      onPageUpdated(page);
    }
  }

  function commitColor(next: string | null) {
    if (next === (page.backgroundColor ?? null)) return;
    void patch({ backgroundColor: next });
  }

  return (
    <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="인스펙터 접기" />}
        <div className="flex-1 text-xs uppercase tracking-wide text-muted-foreground">페이지</div>
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Ruler}>페이지 크기</SectionLabel>
        <PageSizeSelect value={page.size} onChange={(size) => void patch({ size })} />
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Palette}>배경 색</SectionLabel>
        <div className="flex items-center gap-2">
          <HexColorField
            value={currentColor}
            fallback={currentColor}
            onCommit={commitColor}
            ariaLabel="페이지 배경 색"
          />
        </div>
        {hasColor && (
          <button
            type="button"
            onClick={() => commitColor(null)}
            className="text-caption text-muted-foreground hover:text-foreground hover:underline"
          >
            배경 색 제거 (투명)
          </button>
        )}
        <p className="text-caption text-muted-foreground">
          내보내기 시 패널이 없는 영역에 적용됩니다.
        </p>
      </div>
    </aside>
  );
}
