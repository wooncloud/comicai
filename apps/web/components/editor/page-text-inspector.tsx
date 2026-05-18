'use client';
import { Type } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import { PAGE_TEXT_FONT_FAMILIES, type PageTextFontFamily } from '@comicai/types';
import type { PageTextShape } from './tldraw/page-text-shape';
import { SectionLabel } from './section-label';
import { CollapseButton } from './collapse-button';
import { HexColorField } from './hex-color-field';
import { NumberField } from './number-field';
import { AlignToggle } from './align-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  shape: PageTextShape;
  onCollapse?: () => void;
}

export function PageTextInspector({ editor, shapeId, shape, onCollapse }: Props) {
  const p = shape.props;

  function patch(next: Partial<PageTextShape['props']>) {
    editor.updateShape<PageTextShape>({
      id: shapeId,
      type: 'page-text',
      props: { ...shape.props, ...next },
    });
  }

  return (
    <aside className="flex min-h-0 w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="인스펙터 접기" />}
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          텍스트 {p.textId ? `· ${p.textId.slice(-8)}` : '· 저장 중…'}
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Type}>텍스트</SectionLabel>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">폰트</div>
          <Select
            value={p.fontFamily}
            onValueChange={(v) => patch({ fontFamily: v as PageTextFontFamily })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TEXT_FONT_FAMILIES.map((f) => (
                <SelectItem key={f} value={f}>
                  <span style={{ fontFamily: f }}>{f}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">정렬</div>
          <AlignToggle value={p.textAlign} onChange={(v) => patch({ textAlign: v })} />
        </div>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">크기</div>
          <div className="flex items-center gap-2">
            <NumberField
              value={p.fontSize}
              min={6}
              max={200}
              step={1}
              onCommit={(v) => patch({ fontSize: v })}
              ariaLabel="글자 크기"
            />
            <span className="text-caption text-muted-foreground">px</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">색</div>
          <div className="flex items-center gap-2">
            <HexColorField
              value={p.color}
              onCommit={(v) => patch({ color: v })}
              ariaLabel="글자 색"
              variant="panel"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
