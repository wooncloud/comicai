'use client';
import { Ruler, Palette, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiPaths, type PageDTO } from '@comicai/types';
import { PageSizeSelect } from './page-size-select';
import { Button } from '@/components/ui/button';
import { SectionLabel } from './section-label';
import { InspectorShell } from './inspector-shell';
import { HexColorField } from './hex-color-field';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';

interface Props {
  page: PageDTO;
  onPageUpdated: (page: PageDTO) => void;
  /** 내보내기 다이얼로그를 연다. 다이얼로그 자체는 에디터가 들고 있다(컷 목록이 필요하다). */
  onExport: () => void;
  /** 호출 시 인스펙터를 접는다. */
  onCollapse?: () => void;
}

/**
 * 패널이 선택되지 않았을 때 우측에 노출되는 페이지 단위 인스펙터.
 * 페이지 크기·배경색·내보내기 — 이 페이지 한 장에 대한 것들.
 */
export function PageInspector({ page, onPageUpdated, onExport, onCollapse }: Props) {
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
      toast.push('error', errorMessage(err, '페이지 설정을 저장'));
      onPageUpdated(page);
    }
  }

  function commitColor(next: string | null) {
    if (next === (page.backgroundColor ?? null)) return;
    void patch({ backgroundColor: next });
  }

  return (
    <InspectorShell title="페이지" onCollapse={onCollapse}>
      <div className="space-y-2">
        <SectionLabel icon={Ruler}>페이지 크기</SectionLabel>
        <PageSizeSelect value={page.size} onChange={(size) => void patch({ size })} />
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Palette}>배경 색</SectionLabel>
        <div className="flex items-center gap-2">
          <HexColorField value={currentColor} onCommit={commitColor} ariaLabel="페이지 배경 색" />
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
          내보내기 시 컷이 없는 영역에 적용됩니다.
        </p>
      </div>

      {/*
        내보내기는 **이 페이지 한 장**을 내보낸다. 예전에는 헤더 오른쪽 끝에 있었는데,
        거기는 앱 전체에 대한 자리라 "작품 전부" 로 읽혔다. 크기·배경색과 나란히 두면
        무엇이 나가는지가 버튼 위치로 드러난다.
      */}
      <div className="space-y-2">
        <SectionLabel icon={Download}>내보내기</SectionLabel>
        <Button variant="outline" onClick={onExport} className="w-full">
          이 페이지 내보내기
        </Button>
      </div>
    </InspectorShell>
  );
}
