'use client';
import { MessageSquare, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Editor, TLShapeId } from 'tldraw';
import { defaultTailPoint } from '@comicai/types';
import type { SpeechBubbleShape } from './tldraw/speech-bubble-shape';
import { useShapeProps } from './tldraw/use-shape-props';
import { Field, InspectorSection } from './inspector-section';
import { InspectorShell } from './inspector-shell';
import { ColorField } from '@/components/ui/color-field';
import { StrokeWidthField } from './stroke-width-field';
import { TextStyleFields } from './text-style-fields';
import { LayerOrderSection } from './layer-order-section';
import type { LayerOrder } from '@/lib/use-layer-reorder';

interface Props {
  editor: Editor;
  shapeId: TLShapeId;
  order: LayerOrder;
}

export function SpeechBubbleInspector({ editor, shapeId, order }: Props) {
  const { props: p, patch } = useShapeProps<SpeechBubbleShape>(editor, shapeId);
  if (!p) return null;
  const hasTail = p.tailX !== null && p.tailY !== null;

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
            onChange={(v) => patch({ fillColor: v })}
            ariaLabel="말풍선 채움색"
            live
          />
        </Field>
        {/*
          색과 굵기를 한 줄에 두지 않는다. 색칸을 누르면 팝오버가 뜨는데, 한 줄에
          같이 있으면 팝오버가 굵기 손잡이를 덮는다 — 무엇에 딸린 값인지 흐려진다.
        */}
        <Field label="선 색">
          <ColorField
            value={p.strokeColor}
            onChange={(v) => patch({ strokeColor: v })}
            ariaLabel="말풍선 선 색"
            live
          />
        </Field>
        <Field label="선 굵기">
          <StrokeWidthField
            value={p.strokeWidth}
            onChange={(v) => patch({ strokeWidth: v })}
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
        {/* 풍선은 선 색과 구분하려고 글자 색을 `textColor` 로 둔다. */}
        <TextStyleFields
          label="대사 글자"
          value={{ ...p, color: p.textColor }}
          onChange={({ color, ...rest }) =>
            patch(color === undefined ? rest : { ...rest, textColor: color })
          }
        />
      </InspectorSection>

      <LayerOrderSection order={order} />
    </InspectorShell>
  );
}
