'use client';
import type { Editor, IndexKey } from 'tldraw';
import {
  ApiPaths,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
  TAIL_WIDTH_RANGE,
  type SpeechBubbleDTO,
  type SpeechBubbleShape as ApiBubbleShape,
  type SpeechBubbleStyle,
  type PageTextStyle,
} from '@comicai/types';
import type { SpeechBubbleShape } from './speech-bubble-shape';
import { useShapeSync, type ShapeSyncSpec } from './use-shape-sync';

interface Args {
  editor: Editor | null;
  pageId: string;
  bubbles: SpeechBubbleDTO[];
  onBubblesChanged: (bubbles: SpeechBubbleDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

function flatten(b: SpeechBubbleDTO): SpeechBubbleShape['props'] {
  const style = { ...defaultSpeechBubbleStyle(), ...b.style };
  const ts = { ...defaultPageTextStyle(), ...b.textStyle };
  return {
    w: Math.max(1, b.shape.w),
    h: Math.max(1, b.shape.h),
    bubbleId: b.id,
    variant: b.variant,
    polygonPoints: b.shape.points ?? null,
    tailX: b.shape.tail?.x ?? null,
    tailY: b.shape.tail?.y ?? null,
    // 두께 조절이 생기기 전에 저장된 꼬리에는 없다.
    tailWidth: b.shape.tail?.width ?? TAIL_WIDTH_RANGE.default,
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
    text: b.text,
    fontSize: ts.fontSize,
    fontFamily: ts.fontFamily,
    textColor: ts.color,
    textAlign: ts.textAlign,
  };
}

function toApi(shape: SpeechBubbleShape): {
  variant: SpeechBubbleShape['props']['variant'];
  shape: ApiBubbleShape;
  style: Partial<SpeechBubbleStyle>;
  text: string;
  textStyle: Partial<PageTextStyle>;
} {
  const { x, y } = shape;
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
  return {
    variant,
    shape: {
      x,
      y,
      w,
      h,
      points:
        variant === 'polygon' && polygonPoints && polygonPoints.length >= 3
          ? polygonPoints
          : undefined,
      tail: tailX !== null && tailY !== null ? { x: tailX, y: tailY, width: tailWidth } : null,
    },
    style: { strokeWidth, strokeColor, fillColor },
    text,
    textStyle: { fontSize, fontFamily, color: textColor, textAlign },
  };
}

export function useSpeechBubbleSync({
  editor,
  pageId,
  bubbles,
  onBubblesChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  useShapeSync<SpeechBubbleShape, SpeechBubbleDTO>(SPEC, {
    editor,
    pageId,
    items: bubbles,
    onItemsChanged: onBubblesChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<SpeechBubbleShape, SpeechBubbleDTO> = {
  type: 'speech-bubble',
  idProp: 'bubbleId',
  shapeIdPrefix: 'bubble',
  layerRange: ['a2' as IndexKey, 'a3' as IndexKey],
  listPath: ApiPaths.pageSpeechBubbles,
  itemPath: ApiPaths.speechBubble,
  toBody: toApi,
  toShape: (dto) => ({
    x: dto.shape.x,
    y: dto.shape.y,
    props: flatten(dto),
  }),
};
