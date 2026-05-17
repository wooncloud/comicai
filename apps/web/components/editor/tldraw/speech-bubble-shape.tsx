'use client';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  useIsEditing,
  type RecordProps,
  T,
  type TLBaseShape,
} from 'tldraw';
import { SPEECH_BUBBLE_VARIANTS, type SpeechBubbleVariant } from '@comicai/types';

export interface NormalizedPoint {
  x: number;
  y: number;
}

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
      textAlign: 'center',
    };
  }

  override indicator(shape: SpeechBubbleShape) {
    const { w, h, variant, polygonPoints } = shape.props;
    return <path d={bodyPathFor(variant, w, h, polygonPoints)} />;
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
    textAlign,
  } = shape.props;
  const bodyPath = bodyPathFor(variant, w, h, polygonPoints);
  const tailPath = tailX !== null && tailY !== null ? tailPathFor(tailX, tailY, w, h) : null;

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
        contentEditable={isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={(e) => {
          if (!isEditing) return;
          const next = (e.currentTarget.textContent ?? '').slice(0, 2000);
          util.editor.updateShape<SpeechBubbleShape>({
            id: shape.id,
            type: 'speech-bubble',
            props: { ...shape.props, text: next },
          });
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
          color: '#111',
          outline: isEditing ? '1px dashed rgba(0,0,0,0.3)' : 'none',
          cursor: isEditing ? 'text' : 'inherit',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: isEditing ? 'text' : 'none',
          pointerEvents: isEditing ? 'auto' : 'none',
        }}
      >
        {text}
      </div>
    </HTMLContainer>
  );
}

function bodyPathFor(
  variant: SpeechBubbleVariant,
  w: number,
  h: number,
  polygonPoints: NormalizedPoint[] | null,
): string {
  switch (variant) {
    case 'ellipse':
    case 'thought':
      return ellipsePath(w / 2, h / 2, w / 2 - 1, h / 2 - 1);
    case 'rect': {
      const r = Math.min(w, h) * 0.12;
      return roundedRectPath(1, 1, w - 2, h - 2, r);
    }
    case 'cloud':
      return cloudPath(w, h);
    case 'spike':
      return spikePath(w, h);
    case 'polygon': {
      if (!polygonPoints || polygonPoints.length < 3)
        return ellipsePath(w / 2, h / 2, w / 2 - 1, h / 2 - 1);
      const pts = polygonPoints.map((p) => `${p.x * w},${p.y * h}`).join(' L ');
      return `M ${pts} Z`;
    }
  }
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h - rr}`,
    `Q ${x + w} ${y + h} ${x + w - rr} ${y + h}`,
    `L ${x + rr} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - rr}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    'Z',
  ].join(' ');
}

function cloudPath(w: number, h: number): string {
  const k = 0.18;
  const rx = w * 0.45;
  const ry = h * 0.45;
  const cx = w / 2;
  const cy = h / 2;
  return [
    `M ${cx - rx} ${cy}`,
    `Q ${cx - rx} ${cy - ry * (1 + k)} ${cx - rx * 0.5} ${cy - ry}`,
    `Q ${cx} ${cy - ry * (1 + k)} ${cx + rx * 0.5} ${cy - ry}`,
    `Q ${cx + rx} ${cy - ry * (1 + k)} ${cx + rx} ${cy}`,
    `Q ${cx + rx} ${cy + ry * (1 + k)} ${cx + rx * 0.5} ${cy + ry}`,
    `Q ${cx} ${cy + ry * (1 + k)} ${cx - rx * 0.5} ${cy + ry}`,
    `Q ${cx - rx} ${cy + ry * (1 + k)} ${cx - rx} ${cy}`,
    'Z',
  ].join(' ');
}

function spikePath(w: number, h: number): string {
  const n = 12;
  const cx = w / 2;
  const cy = h / 2;
  const rxOuter = w / 2 - 1;
  const ryOuter = h / 2 - 1;
  const rInnerFactor = 0.7;
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const ratio = i % 2 === 0 ? 1 : rInnerFactor;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * rxOuter * ratio},${cy + Math.sin(a) * ryOuter * ratio}`);
  }
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}

function tailPathFor(tx: number, ty: number, w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const perp = { x: -dy, y: dx };
  const len = Math.hypot(perp.x, perp.y) || 1;
  const span = Math.max(8, Math.min(w, h) * 0.12);
  const ax = cx + (perp.x / len) * span;
  const ay = cy + (perp.y / len) * span;
  const bx = cx - (perp.x / len) * span;
  const by = cy - (perp.y / len) * span;
  return `M ${ax} ${ay} L ${tx} ${ty} L ${bx} ${by} Z`;
}
