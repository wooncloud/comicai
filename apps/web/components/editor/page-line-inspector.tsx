'use client';
import { Slash } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import { PAGE_LINE_STROKE_STYLES, type PageLineStrokeStyle } from '@comicai/types';
import type { PageLineShape } from './tldraw/page-line-shape';
import { SectionLabel } from './section-label';
import { CollapseButton } from './collapse-button';
import { HexColorField } from './hex-color-field';
import { NumberField } from './number-field';
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
  shape: PageLineShape;
  onCollapse?: () => void;
}

const STROKE_STYLE_LABEL: Record<PageLineStrokeStyle, string> = {
  solid: '실선',
  dashed: '점선',
};

export function PageLineInspector({ editor, shapeId, shape, onCollapse }: Props) {
  const p = shape.props;

  /*
   * **바뀐 키만 넘긴다.** `updateShape` 는 props 를 부분 병합하므로 스프레드가
   * 필요 없고, 스프레드하면 오히려 해롭다 — `shape` 는 선택 시점의 스냅샷이라
   * 그 사이 서버가 채워 준 `lineId` 이 아직 null 인 낡은 값일 수 있다. 그걸
   * 되쓰면 id 가 다시 null 이 되고, 그 뒤 이 도형의 모든 편집이 저장 큐에서
   * "id 없음" 으로 걸러진다 — 색을 한 번 바꿨을 뿐인데 영구히 저장되지 않았다.
   */
  function patch(next: Partial<PageLineShape['props']>) {
    editor.updateShape<PageLineShape>({ id: shapeId, type: 'page-line', props: next });
  }

  return (
    <aside className="flex min-h-0 w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="속성 창 접기" />}
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          직선{p.lineId ? '' : ' · 저장 중…'}
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Slash}>선</SectionLabel>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">색</div>
          <div className="flex items-center gap-2">
            <HexColorField
              value={p.strokeColor}
              onCommit={(v) => patch({ strokeColor: v })}
              ariaLabel="선 색"
              variant="panel"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">굵기</div>
          <div className="flex items-center gap-2">
            <NumberField
              value={p.strokeWidth}
              min={1}
              max={40}
              step={1}
              onCommit={(v) => patch({ strokeWidth: v })}
              ariaLabel="선 굵기"
            />
            <span className="text-caption text-muted-foreground">px</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">종류</div>
          <Select
            value={p.strokeStyle}
            onValueChange={(v) => patch({ strokeStyle: v as PageLineStrokeStyle })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_LINE_STROKE_STYLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STROKE_STYLE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </aside>
  );
}
