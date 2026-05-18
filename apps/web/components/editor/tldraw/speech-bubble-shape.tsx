'use client';
import { useLayoutEffect, useRef } from 'react';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  useIsEditing,
  type RecordProps,
  T,
  type TLBaseShape,
} from 'tldraw';
import {
  bubbleBodyPath,
  bubbleTailPath,
  SPEECH_BUBBLE_VARIANTS,
  type NormalizedPoint,
  type SpeechBubbleVariant,
} from '@comicai/types';

export type SpeechBubbleShape = TLBaseShape<
  'speech-bubble',
  {
    w: number;
    h: number;
    /** 백엔드 id. null이면 신규로 막 만든 상태 — 다음 sync에서 채워짐. */
    bubbleId: string | null;
    variant: SpeechBubbleVariant;
    /** polygon variant 전용. bbox 0..1 정규화 vertex. */
    polygonPoints: NormalizedPoint[] | null;
    /** 꼬리 끝점 (shape 좌상단 기준 px). null이면 꼬리 없음. */
    tailX: number | null;
    tailY: number | null;
    /** 단일 라인 텍스트(평탄화). 줄바꿈은 \n. */
    text: string;
    fontSize: number;
    strokeWidth: number;
    strokeColor: string;
    fillColor: string;
    textColor: string;
    textAlign: 'left' | 'center' | 'right';
  }
>;

const NormalizedPointSchema = T.object({ x: T.number, y: T.number });

export class SpeechBubbleShapeUtil extends BaseBoxShapeUtil<SpeechBubbleShape> {
  static override type = 'speech-bubble' as const;
  static override props: RecordProps<SpeechBubbleShape> = {
    w: T.number,
    h: T.number,
    bubbleId: T.string.nullable(),
    variant: T.literalEnum(...SPEECH_BUBBLE_VARIANTS),
    polygonPoints: T.arrayOf(NormalizedPointSchema).nullable(),
    tailX: T.number.nullable(),
    tailY: T.number.nullable(),
    text: T.string,
    fontSize: T.number,
    strokeWidth: T.number,
    strokeColor: T.string,
    fillColor: T.string,
    textColor: T.string,
    textAlign: T.literalEnum('left', 'center', 'right'),
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    return true;
  }
  override canBind() {
    return false;
  }

  getDefaultProps(): SpeechBubbleShape['props'] {
    return {
      w: 160,
      h: 100,
      bubbleId: null,
      variant: 'ellipse',
      polygonPoints: null,
      tailX: null,
      tailY: null,
      text: '',
      fontSize: 14,
      strokeWidth: 2,
      strokeColor: '#000000',
      fillColor: '#ffffff',
      textColor: '#111111',
      textAlign: 'center',
    };
  }

  override component(shape: SpeechBubbleShape) {
    return <SpeechBubbleBody shape={shape} util={this} />;
  }

  override indicator(shape: SpeechBubbleShape) {
    const { w, h, variant, polygonPoints } = shape.props;
    return <path d={bubbleBodyPath(variant, w, h, polygonPoints)} />;
  }
}

function SpeechBubbleBody({
  shape,
  util,
}: {
  shape: SpeechBubbleShape;
  util: SpeechBubbleShapeUtil;
}) {
  const isEditing = useIsEditing(shape.id);
  const {
    w,
    h,
    variant,
    polygonPoints,
    tailX,
    tailY,
    text,
    fontSize,
    strokeWidth,
    strokeColor,
    fillColor,
    textColor,
    textAlign,
  } = shape.props;
  const bodyPath = bubbleBodyPath(variant, w, h, polygonPoints);
  const tailPath = tailX !== null && tailY !== null ? bubbleTailPath(tailX, tailY, w, h) : null;

  const editableRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  // 외부 변경(예: DTO sync, 인스펙터에서 다른 필드 변경 후 re-render)만 textContent 에 반영.
  // 사용자 키 입력 중에는 textContent 가 이미 최신이라 분기 통과 — caret 재설정 없음.
  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    if ((el.textContent ?? '') !== text) {
      el.textContent = text;
    }
  }, [text]);

  function commit(next: string) {
    const sliced = next.slice(0, 2000);
    if (sliced === shape.props.text) return;
    util.editor.updateShape<SpeechBubbleShape>({
      id: shape.id,
      type: 'speech-bubble',
      props: { ...shape.props, text: sliced },
    });
  }

  return (
    <HTMLContainer
      style={{
        width: w,
        height: h,
        pointerEvents: 'all',
        position: 'relative',
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        <path
          d={bodyPath}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {tailPath && (
          <path
            d={tailPath}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div
        ref={editableRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          if (!isEditing) return;
          commit(e.currentTarget.textContent ?? '');
        }}
        onInput={(e) => {
          if (!isEditing) return;
          // IME 조합 중에는 보류 — compositionend 시점에 한 번에 반영.
          if (composingRef.current) return;
          commit(e.currentTarget.textContent ?? '');
        }}
        onPointerDown={(e) => {
          if (isEditing) e.stopPropagation();
        }}
        style={{
          position: 'absolute',
          inset: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
          textAlign,
          fontSize,
          lineHeight: 1.25,
          color: textColor,
          outline: isEditing ? '1px dashed rgba(0,0,0,0.3)' : 'none',
          cursor: isEditing ? 'text' : 'inherit',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: isEditing ? 'text' : 'none',
          pointerEvents: isEditing ? 'auto' : 'none',
        }}
      />
    </HTMLContainer>
  );
}
