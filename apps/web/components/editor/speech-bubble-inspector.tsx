'use client';
import { MessageSquare } from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import type { SpeechBubbleShape } from './tldraw/speech-bubble-shape';
import { SectionLabel } from './section-label';
import { CollapseButton } from './collapse-button';
import { HexColorField } from './hex-color-field';
import { NumberField } from './number-field';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  shape: SpeechBubbleShape;
  onCollapse?: () => void;
}

export function SpeechBubbleInspector({ editor, shapeId, shape, onCollapse }: Props) {
  const p = shape.props;

  function patch(next: Partial<SpeechBubbleShape['props']>) {
    editor.updateShape<SpeechBubbleShape>({
      id: shapeId,
      type: 'speech-bubble',
      props: { ...shape.props, ...next },
    });
  }

  return (
    <aside className="flex min-h-0 w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="인스펙터 접기" />}
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          말풍선 {p.bubbleId ? `· ${p.bubbleId.slice(-8)}` : '· 저장 중…'}
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel icon={MessageSquare}>말풍선</SectionLabel>
        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">채움</div>
          <div className="flex items-center gap-2">
            <HexColorField
              value={p.fillColor}
              onCommit={(v) => patch({ fillColor: v })}
              ariaLabel="말풍선 채움색"
              variant="panel"
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">선</div>
          <div className="flex items-center gap-2">
            <HexColorField
              value={p.strokeColor}
              onCommit={(v) => patch({ strokeColor: v })}
              ariaLabel="말풍선 선 색"
              variant="panel"
            />
            <NumberField
              value={p.strokeWidth}
              min={0}
              max={20}
              step={1}
              onCommit={(v) => patch({ strokeWidth: v })}
              ariaLabel="말풍선 선 굵기"
            />
            <span className="text-caption text-muted-foreground">px</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
