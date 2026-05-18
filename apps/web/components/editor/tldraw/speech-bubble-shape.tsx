'use client';
import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLBaseShape } from 'tldraw';
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
    strokeWidth: number;
    strokeColor: string;
    fillColor: string;
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
    strokeWidth: T.number,
    strokeColor: T.string,
    fillColor: T.string,
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    return false;
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
      strokeWidth: 2,
      strokeColor: '#000000',
      fillColor: '#ffffff',
    };
  }

  override component(shape: SpeechBubbleShape) {
    return <SpeechBubbleBody shape={shape} />;
  }

  override indicator(shape: SpeechBubbleShape) {
    const { w, h, variant, polygonPoints } = shape.props;
    return <path d={bubbleBodyPath(variant, w, h, polygonPoints)} />;
  }
}

function SpeechBubbleBody({ shape }: { shape: SpeechBubbleShape }) {
  const { w, h, variant, polygonPoints, tailX, tailY, strokeWidth, strokeColor, fillColor } =
    shape.props;
  const bodyPath = bubbleBodyPath(variant, w, h, polygonPoints);
  const tailPath = tailX !== null && tailY !== null ? bubbleTailPath(tailX, tailY, w, h) : null;

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
    </HTMLContainer>
  );
}
