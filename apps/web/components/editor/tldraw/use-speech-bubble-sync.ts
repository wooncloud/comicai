'use client';
import type { Editor } from 'tldraw';
import {
  ApiPaths,
  defaultSpeechBubbleStyle,
  type NormalizedPoint,
  type SpeechBubbleDTO,
  type SpeechBubbleShape as ApiBubbleShape,
  type SpeechBubbleStyle,
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
  return {
    w: Math.max(1, b.shape.w),
    h: Math.max(1, b.shape.h),
    bubbleId: b.id,
    variant: b.variant,
    polygonPoints: b.shape.points ?? null,
    tailX: b.shape.tail?.x ?? null,
    tailY: b.shape.tail?.y ?? null,
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
  };
}

function toApi(shape: SpeechBubbleShape): {
  variant: SpeechBubbleShape['props']['variant'];
  shape: ApiBubbleShape;
  style: Partial<SpeechBubbleStyle>;
} {
  const { x, y } = shape;
  const { w, h, variant, polygonPoints, tailX, tailY, strokeWidth, strokeColor, fillColor } =
    shape.props;
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
      tail: tailX !== null && tailY !== null ? { x: tailX, y: tailY } : null,
    },
    style: { strokeWidth, strokeColor, fillColor },
  };
}

function samePropsAsDto(
  shape: SpeechBubbleShape,
  next: { x: number; y: number; props: SpeechBubbleShape['props'] },
): boolean {
  const cur = shape.props;
  const n = next.props;
  if (
    shape.x !== next.x ||
    shape.y !== next.y ||
    cur.w !== n.w ||
    cur.h !== n.h ||
    cur.variant !== n.variant ||
    cur.tailX !== n.tailX ||
    cur.tailY !== n.tailY ||
    cur.strokeWidth !== n.strokeWidth ||
    cur.strokeColor !== n.strokeColor ||
    cur.fillColor !== n.fillColor
  ) {
    return false;
  }
  return samePolygon(cur.polygonPoints, n.polygonPoints);
}

function samePolygon(a: NormalizedPoint[] | null, b: NormalizedPoint[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((pa, i) => pa.x === b[i]?.x && pa.y === b[i].y);
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
  listPath: ApiPaths.pageSpeechBubbles,
  itemPath: ApiPaths.speechBubble,
  toBody: toApi,
  toShape: (dto) => ({
    x: dto.shape.x,
    y: dto.shape.y,
    props: flatten(dto),
  }),
  isEqual: samePropsAsDto,
};
