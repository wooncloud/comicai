'use client';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
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
  TAIL_WIDTH_RANGE,
  TEXT_ALIGNS,
  type NormalizedPoint,
  type PageTextFontFamily,
  type SpeechBubbleVariant,
  type TextAlign,
} from '@comicai/types';
import { EditableText } from './editable-text';

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
    /** 꼬리 두께 — 자동 폭에 곱하는 %(`TAIL_WIDTH_RANGE`). */
    tailWidth: number;
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
    tailWidth: T.number,
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
      tailWidth: TAIL_WIDTH_RANGE.default,
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
    tailWidth,
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
  const tailPath =
    tailX !== null && tailY !== null ? bubbleTailPath(tailX, tailY, w, h, tailWidth) : null;

  const box = bubbleTextBox(variant, w, h, polygonPoints);

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
        {/* 순서는 `BUBBLE_DRAW_ORDER` — 선(두 배 굵기, 채움 없이) 먼저, 채움은 그 위에.
            채움이 선의 안쪽 절반을 덮어 선이 바깥쪽으로만 정한 굵기만큼 남고, 몸통과
            꼬리가 만나는 자리의 선도 덮여 둘이 한 덩어리가 된다. */}
        <g
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth * 2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          {tailPath && <path d={tailPath} vectorEffect="non-scaling-stroke" />}
          <path d={bodyPath} vectorEffect="non-scaling-stroke" />
        </g>
        <g fill={fillColor} stroke="none">
          {tailPath && <path d={tailPath} />}
          <path d={bodyPath} />
        </g>
      </svg>
      <EditableText
        shapeId={shape.id}
        text={text}
        box={box}
        fontSize={fontSize}
        fontFamily={fontFamily}
        color={textColor}
        textAlign={textAlign}
        onCommit={(next) =>
          util.editor.updateShape<SpeechBubbleShape>({
            id: shape.id,
            type: 'speech-bubble',
            props: { text: next },
          })
        }
      />
    </HTMLContainer>
  );
}
