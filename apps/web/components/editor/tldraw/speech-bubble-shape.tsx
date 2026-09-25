'use client';
import { useLayoutEffect, useRef } from 'react';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  useIsEditing,
  type RecordProps,
  T,
  type TLBaseShape,
  type IndexKey,
  type TLHandle,
  type TLHandleDragInfo,
  type TLShapePartial,
} from 'tldraw';
import {
  bubbleBodyPath,
  bubbleTailPath,
  bubbleTextBox,
  defaultTailPoint,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
  PAGE_TEXT_FONT_FAMILIES,
  SPEECH_BUBBLE_VARIANTS,
  TEXT_ALIGNS,
  wrapText,
  type NormalizedPoint,
  type PageTextFontFamily,
  type SpeechBubbleVariant,
  type TextAlign,
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
    strokeWidth: number;
    strokeColor: string;
    fillColor: string;
    /** 풍선이 갖는 대사. 풍선을 옮기면 같이 따라온다. */
    text: string;
    fontSize: number;
    fontFamily: PageTextFontFamily;
    textColor: string;
    textAlign: TextAlign;
  }
>;

const NormalizedPointSchema = T.object({ x: T.number, y: T.number });

/** `PageTextStyle` 을 shape props 이름으로 옮긴다. `color` 는 선 색과 겹쳐 `textColor` 다. */
function textProps(st: ReturnType<typeof defaultPageTextStyle>) {
  return {
    fontSize: st.fontSize,
    fontFamily: st.fontFamily,
    textColor: st.color,
    textAlign: st.textAlign,
  };
}

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
    strokeWidth: T.number,
    strokeColor: T.string,
    fillColor: T.string,
    text: T.string,
    fontSize: T.number,
    fontFamily: T.literalEnum(...PAGE_TEXT_FONT_FAMILIES),
    textColor: T.string,
    textAlign: T.literalEnum(...TEXT_ALIGNS),
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    // 더블클릭하면 풍선 안에서 바로 대사를 친다.
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
      // 스타일 기본값은 packages/types 가 단일 출처다.
      ...defaultSpeechBubbleStyle(),
      text: '',
      ...textProps(defaultPageTextStyle()),
    };
  }

  /**
   * 꼬리 손잡이 하나.
   *
   * 꼬리는 데이터와 렌더가 처음부터 있었는데 **만들 방법이 없었다** — 항상 null 이라
   * 아무도 쓸 수 없는 기능이었다. 여기서 손잡이를 내준다.
   *
   * 아직 꼬리가 없으면 `create` 손잡이(비어 있는 작은 점)를 풍선 아래에 둔다. 끌면
   * 그 자리에 꼬리가 생긴다. 이미 있으면 `vertex` 로 끝점을 잡아 옮긴다.
   */
  override getHandles(shape: SpeechBubbleShape): TLHandle[] {
    const { w, h, tailX, tailY } = shape.props;
    const has = tailX !== null && tailY !== null;
    const at = has ? { x: tailX, y: tailY } : defaultTailPoint(w, h);
    return [
      {
        id: 'tail',
        type: has ? 'vertex' : 'create',
        index: 'a1' as IndexKey,
        x: at.x,
        y: at.y,
        label: '말풍선 꼬리',
        canSnap: false,
      },
    ];
  }

  override onHandleDrag(
    _shape: SpeechBubbleShape,
    { handle }: TLHandleDragInfo<SpeechBubbleShape>,
  ): TLShapePartial<SpeechBubbleShape> | void {
    if (handle.id !== 'tail') return;
    return { id: _shape.id, type: 'speech-bubble', props: { tailX: handle.x, tailY: handle.y } };
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
  const {
    w,
    h,
    variant,
    polygonPoints,
    tailX,
    tailY,
    strokeWidth,
    strokeColor,
    fillColor,
    text,
    fontSize,
    fontFamily,
    textColor,
    textAlign,
  } = shape.props;
  const bodyPath = bubbleBodyPath(variant, w, h, polygonPoints);
  const tailPath = tailX !== null && tailY !== null ? bubbleTailPath(tailX, tailY, w, h) : null;

  const isEditing = useIsEditing(shape.id);
  const editableRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const box = bubbleTextBox(variant, w, h, polygonPoints);

  /*
   * 편집 중이 아닐 때만 밖에서 온 값을 넣는다 — page-text-shape 와 같은 이유다.
   * 저장 뒤 재조회가 방금 친 글자를 지우고 캐럿을 앞으로 보내는 일이 있었다.
   */
  useLayoutEffect(() => {
    if (isEditing) return;
    const el = editableRef.current;
    if (el && el.textContent !== text) el.textContent = text;
  }, [text, isEditing]);

  /* 편집이 열리면 실제로 캐럿을 준다. tldraw 는 상태만 바꾼다. */
  useLayoutEffect(() => {
    if (!isEditing) return;
    const el = editableRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing]);

  function commit(next: string) {
    const sliced = next.slice(0, 2000);
    if (sliced === shape.props.text) return;
    util.editor.updateShape<SpeechBubbleShape>({
      id: shape.id,
      type: 'speech-bubble',
      props: { text: sliced },
    });
  }

  /*
   * 줄바꿈은 `wrapText` 로 미리 끊는다 — **export 와 같은 함수다.**
   * CSS 로 접으면 화면과 내보낸 PNG 의 줄 수가 달라진다(librsvg 에는 foreignObject 가 없다).
   * 편집 중에는 캐럿이 필요해 원문 그대로 두고, 폭만 같게 잡아 미리보기를 맞춘다.
   */
  const lines = wrapText(text, { maxWidth: box.w, fontSize });

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
        {/* 순서는 `BUBBLE_DRAW_ORDER` — 꼬리, 몸통, 꼬리 채움. 셋째가 몸통 테두리가
            꼬리를 가로지르는 구간을 덮어 둘이 한 덩어리로 보인다. */}
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
        <path
          d={bodyPath}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {tailPath && <path d={tailPath} fill={fillColor} stroke="none" />}
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
          commit(e.currentTarget.textContent);
        }}
        onInput={(e) => {
          if (!isEditing) return;
          if (composingRef.current) return;
          commit(e.currentTarget.textContent);
        }}
        onPointerDown={(e) => {
          if (isEditing) e.stopPropagation();
        }}
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems:
            textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
          justifyContent: 'center',
          textAlign,
          fontSize,
          fontFamily,
          lineHeight: 1.25,
          color: textColor,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          outline: isEditing ? '1px dashed rgba(0,0,0,0.3)' : 'none',
          cursor: isEditing ? 'text' : 'inherit',
          userSelect: isEditing ? 'text' : 'none',
          pointerEvents: isEditing ? 'auto' : 'none',
        }}
      >
        {isEditing ? null : lines.map((l, i) => <div key={i}>{l === '' ? '\u00a0' : l}</div>)}
      </div>
    </HTMLContainer>
  );
}
