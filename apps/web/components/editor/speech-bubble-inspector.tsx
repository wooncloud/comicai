'use client';
import { Layers, MessageSquare, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Editor, TLShapeId } from 'tldraw';
import {
  PAGE_TEXT_FONT_FAMILIES,
  PAGE_TEXT_FONT_LABEL,
  defaultTailPoint,
  type PageTextFontFamily,
} from '@comicai/types';
import type { SpeechBubbleShape } from './tldraw/speech-bubble-shape';
import { Field, InspectorSection } from './inspector-section';
import { InspectorShell } from './inspector-shell';
import { ColorField } from '@/components/ui/color-field';
import { NumberField } from './number-field';
import { StrokeWidthField } from './stroke-width-field';
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
}

export function SpeechBubbleInspector({
  editor,
  shapeId,
  shape,
  canMoveForward,
  canMoveBackward,
  onReorder,
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
    <InspectorShell
      title={`말풍선${p.bubbleId ? '' : ' · 저장 중…'}`}
      onDelete={() => editor.deleteShapes([shapeId])}
      deleteLabel="말풍선 삭제"
    >
      <InspectorSection icon={MessageSquare} title="말풍선">
        <Field label="채움">
          <ColorField
            value={p.fillColor}
            onCommit={(v) => patch({ fillColor: v })}
            ariaLabel="말풍선 채움색"
            variant="panel"
          />
        </Field>
        {/*
          색과 굵기를 한 줄에 두지 않는다. 색칸을 누르면 팝오버가 뜨는데, 한 줄에
          같이 있으면 팝오버가 굵기 손잡이를 덮는다 — 무엇에 딸린 값인지 흐려진다.
        */}
        <Field label="선 색">
          <ColorField
            value={p.strokeColor}
            onCommit={(v) => patch({ strokeColor: v })}
            ariaLabel="말풍선 선 색"
            variant="panel"
          />
        </Field>
        <Field label="선 굵기">
          {/*
            끄는 동안에도 셰이프를 고쳐 캔버스가 따라오게 한다. 서버 저장은 sync 훅이
            1.5초 디바운스하므로 요청이 쌓이지 않는다 — 컷 테두리만 직접 PATCH 라
            거기서는 미리보기와 저장을 갈라야 했다.
          */}
          <StrokeWidthField
            value={p.strokeWidth}
            onPreview={(v) => patch({ strokeWidth: v })}
            onCommit={(v) => patch({ strokeWidth: v })}
            ariaLabel="말풍선 선 굵기"
          />
        </Field>

        {/*
          꼬리는 캔버스에서 손잡이를 끌어 옮긴다. 버튼을 둔 이유는 두 가지다 —
          손잡이만 있으면 꼬리를 달 수 있다는 걸 모르고, hover 가 없는 기기에서는
          빈 손잡이가 잘 안 보인다. 없애는 길도 캔버스에는 없다.
        */}
        <Field label="꼬리">
          {hasTail ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => patch({ tailX: null, tailY: null })}
            >
              꼬리 없애기
            </Button>
          ) : (
            <div className="space-y-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
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
        </Field>
      </InspectorSection>

      {/*
        대사는 풍선이 갖는다. 예전에는 텍스트 상자를 따로 만들어 위에 얹어야 했고,
        풍선을 옮기면 글자가 그 자리에 남았다. 풍선을 더블클릭하면 여기 값으로 그려진다.
      */}
      <InspectorSection icon={Type} title="대사">
        <p className="text-caption text-muted-foreground">
          풍선을 더블클릭하면 바로 쓸 수 있습니다. 풍선 폭에 맞춰 줄이 바뀝니다.
        </p>

        <Field label="폰트">
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
                  <span style={{ fontFamily: f }}>{PAGE_TEXT_FONT_LABEL[f]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="정렬">
          <AlignToggle value={p.textAlign} onChange={(v) => patch({ textAlign: v })} />
        </Field>

        <Field label="크기">
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
        </Field>

        <Field label="글자 색">
          <ColorField
            value={p.textColor}
            onCommit={(v) => patch({ textColor: v })}
            ariaLabel="대사 글자 색"
            variant="panel"
          />
        </Field>
      </InspectorSection>

      {onReorder && (
        <InspectorSection icon={Layers} title="순서">
          <LayerOrderControls
            canMoveForward={canMoveForward ?? false}
            canMoveBackward={canMoveBackward ?? false}
            onReorder={onReorder}
            disabled={!p.bubbleId}
          />
        </InspectorSection>
      )}
    </InspectorShell>
  );
}
