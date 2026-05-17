'use client';
import { useEffect, useState } from 'react';
import { ChevronRight, Ruler, Palette } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type PageDTO } from '@comicai/types';
import { PageSizeSelect } from './page-size-select';
import { SectionLabel } from './section-label';
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
  const [color, setColor] = useState<string>(page.backgroundColor ?? '#ffffff');
  const hasColor = !!page.backgroundColor;

  useEffect(() => {
    setColor(page.backgroundColor ?? '#ffffff');
  }, [page.backgroundColor]);

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
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="인스펙터 접기"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">인스펙터 접기</span>
          </button>
        )}
        <div className="flex-1 text-xs uppercase tracking-wide text-muted-foreground">페이지</div>
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Ruler}>페이지 크기</SectionLabel>
        <PageSizeSelect value={page.size} onChange={(size) => void patch({ size })} />
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Palette}>배경 색</SectionLabel>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={(e) => commitColor(e.target.value)}
            aria-label="페이지 배경 색"
            className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) commitColor(v);
              else setColor(page.backgroundColor ?? '#ffffff');
            }}
            className="h-8 flex-1 rounded border border-border bg-background px-2 font-mono text-caption"
            aria-label="페이지 배경 색 (hex)"
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
