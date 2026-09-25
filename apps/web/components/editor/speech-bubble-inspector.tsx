'use client';
import { MessageSquare, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Editor, TLShapeId } from 'tldraw';
import { PAGE_TEXT_FONT_FAMILIES, defaultTailPoint, type PageTextFontFamily } from '@comicai/types';
import type { SpeechBubbleShape } from './tldraw/speech-bubble-shape';
import { SectionLabel } from './section-label';
import { InspectorShell } from './inspector-shell';
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
import { LayerOrderControls } from './layer-order-controls';
import type { LayerOrderAction } from '@/lib/use-layer-reorder';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  shape: SpeechBubbleShape;
  canMoveForward?: boolean;
  canMoveBackward?: boolean;
  onReorder?: (action: LayerOrderAction) => void;
  onCollapse?: () => void;
}

export function SpeechBubbleInspector({
  editor,
  shapeId,
  shape,
  canMoveForward,
  canMoveBackward,
  onReorder,
  onCollapse,
}: Props) {
  const p = shape.props;
  const hasTail = p.tailX !== null && p.tailY !== null;

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
    <InspectorShell title={`말풍선${p.bubbleId ? '' : ' · 저장 중…'}`} onCollapse={onCollapse}>
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

        {/*
          꼬리는 캔버스에서 손잡이를 끌어 옮긴다. 버튼을 둔 이유는 두 가지다 —
          손잡이만 있으면 꼬리를 달 수 있다는 걸 모르고, hover 가 없는 기기에서는
          빈 손잡이가 잘 안 보인다. 없애는 길도 캔버스에는 없다.
        */}
        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">꼬리</div>
          {hasTail ? (
            <Button variant="outline" size="sm" onClick={() => patch({ tailX: null, tailY: null })}>
              꼬리 없애기
            </Button>
          ) : (
            <div className="space-y-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const at = defaultTailPoint(p.w, p.h);
                  patch({ tailX: at.x, tailY: at.y });
                }}
              >
                꼬리 달기
              </Button>
              <p className="text-caption text-muted-foreground">
                달고 나서 끝을 끌어 말하는 사람 쪽으로 향하게 하세요.
              </p>
            </div>
          )}
        </div>
      </div>

      {/*
        대사는 풍선이 갖는다. 예전에는 텍스트 상자를 따로 만들어 위에 얹어야 했고,
        풍선을 옮기면 글자가 그 자리에 남았다. 풍선을 더블클릭하면 여기 값으로 그려진다.
      */}
      <div className="space-y-2">
        <SectionLabel icon={Type}>대사</SectionLabel>
        <p className="text-caption text-muted-foreground">
          풍선을 더블클릭하면 바로 쓸 수 있습니다. 풍선 폭에 맞춰 줄이 바뀝니다.
        </p>

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
              ariaLabel="대사 글자 크기"
            />
            <span className="text-caption text-muted-foreground">px</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-caption text-muted-foreground">글자 색</div>
          <div className="flex items-center gap-2">
            <HexColorField
              value={p.textColor}
              onCommit={(v) => patch({ textColor: v })}
              ariaLabel="대사 글자 색"
              variant="panel"
            />
          </div>
        </div>

        {onReorder && (
          <LayerOrderControls
            canMoveForward={canMoveForward ?? false}
            canMoveBackward={canMoveBackward ?? false}
            onReorder={onReorder}
            disabled={!p.bubbleId}
          />
        )}
      </div>
    </InspectorShell>
  );
}
