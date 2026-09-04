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

  /*
   * **바뀐 키만 넘긴다.** `updateShape` 는 props 를 부분 병합하므로 스프레드가
   * 필요 없고, 스프레드하면 오히려 해롭다 — `shape` 는 선택 시점의 스냅샷이라
   * 그 사이 서버가 채워 준 `bubbleId` 이 아직 null 인 낡은 값일 수 있다. 그걸
   * 되쓰면 id 가 다시 null 이 되고, 그 뒤 이 도형의 모든 편집이 저장 큐에서
   * "id 없음" 으로 걸러진다 — 색을 한 번 바꿨을 뿐인데 영구히 저장되지 않았다.
   */
  function patch(next: Partial<SpeechBubbleShape['props']>) {
    editor.updateShape<SpeechBubbleShape>({ id: shapeId, type: 'speech-bubble', props: next });
  }

  return (
    <aside className="flex min-h-0 w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {onCollapse && <CollapseButton side="right" onClick={onCollapse} title="속성 창 접기" />}
        <div className="flex-1 truncate text-xs uppercase tracking-wide text-muted-foreground">
          말풍선{p.bubbleId ? '' : ' · 저장 중…'}
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
