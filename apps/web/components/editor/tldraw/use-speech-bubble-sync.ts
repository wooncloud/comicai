'use client';
import { useEffect } from 'react';
import { type Editor, createShapeId } from 'tldraw';
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
  const style = { ...defaultSpeechBubbleStyle(), ...(b.style ?? {}) };
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

function samePropsAsDto(shape: SpeechBubbleShape, dto: SpeechBubbleDTO): boolean {
  const next = flatten(dto);
  const cur = shape.props;
  if (
    shape.x !== dto.shape.x ||
    shape.y !== dto.shape.y ||
    cur.w !== next.w ||
    cur.h !== next.h ||
    cur.variant !== next.variant ||
    cur.tailX !== next.tailX ||
    cur.tailY !== next.tailY ||
    cur.strokeWidth !== next.strokeWidth ||
    cur.strokeColor !== next.strokeColor ||
    cur.fillColor !== next.fillColor
  ) {
    return false;
  }
  return samePolygon(cur.polygonPoints, next.polygonPoints);
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
  // DTO → canvas
  useEffect(() => {
    if (!editor) return;
    const existing = new Map<string, SpeechBubbleShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'speech-bubble') {
        const b = s as SpeechBubbleShape;
        if (b.props.bubbleId) existing.set(b.props.bubbleId, b);
      }
    }
    editor.store.mergeRemoteChanges(() => {
      for (const dto of bubbles) {
        const shape = existing.get(dto.id);
        const props = flatten(dto);
        if (shape) {
          if (!samePropsAsDto(shape, dto)) {
            editor.updateShape<SpeechBubbleShape>({
              id: shape.id,
              type: 'speech-bubble',
              x: dto.shape.x,
              y: dto.shape.y,
              props,
            });
          }
          existing.delete(dto.id);
        } else {
          editor.createShape<SpeechBubbleShape>({
            id: createShapeId(`bubble-${dto.id}`),
            type: 'speech-bubble',
            x: dto.shape.x,
            y: dto.shape.y,
            props,
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, bubbles]);

  useShapeSync<SpeechBubbleShape, SpeechBubbleDTO>(SPEC, {
    editor,
    pageId,
    onItemsChanged: onBubblesChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<SpeechBubbleShape, SpeechBubbleDTO> = {
  type: 'speech-bubble',
  idProp: 'bubbleId',
  listPath: ApiPaths.pageSpeechBubbles,
  itemPath: ApiPaths.speechBubble,
  toBody: toApi,
};
