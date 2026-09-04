'use client';
import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { shapeId } from './shape-id';
import {
  ApiPaths,
  defaultPageTextStyle,
  type PageTextDTO,
  type PageTextStyle,
} from '@comicai/types';
import type { PageTextShape } from './page-text-shape';
import { useShapeSync, type ShapeSyncSpec } from './use-shape-sync';

interface Args {
  editor: Editor | null;
  pageId: string;
  texts: PageTextDTO[];
  onTextsChanged: (texts: PageTextDTO[]) => void;
  onSavingChange: (saving: boolean) => void;
  onSaveError?: (err: unknown) => void;
}

function flatten(t: PageTextDTO): PageTextShape['props'] {
  const style = { ...defaultPageTextStyle(), ...(t.style ?? {}) };
  return {
    w: Math.max(1, t.w),
    h: Math.max(1, t.h),
    textId: t.id,
    text: t.text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    color: style.color,
    textAlign: style.textAlign,
  };
}

function toApi(shape: PageTextShape): {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: Partial<PageTextStyle>;
} {
  const { x, y } = shape;
  const { w, h, text, fontSize, fontFamily, color, textAlign } = shape.props;
  return {
    x,
    y,
    w,
    h,
    text,
    style: { fontSize, fontFamily, color, textAlign },
  };
}

function samePropsAsDto(shape: PageTextShape, dto: PageTextDTO): boolean {
  const next = flatten(dto);
  const cur = shape.props;
  return (
    shape.x === dto.x &&
    shape.y === dto.y &&
    cur.w === next.w &&
    cur.h === next.h &&
    cur.text === next.text &&
    cur.fontSize === next.fontSize &&
    cur.fontFamily === next.fontFamily &&
    cur.color === next.color &&
    cur.textAlign === next.textAlign
  );
}

export function usePageTextSync({
  editor,
  pageId,
  texts,
  onTextsChanged,
  onSavingChange,
  onSaveError,
}: Args) {
  // DTO → canvas
  useEffect(() => {
    if (!editor) return;
    const existing = new Map<string, PageTextShape>();
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type === 'page-text') {
        const t = s as PageTextShape;
        if (t.props.textId) existing.set(t.props.textId, t);
      }
    }
    editor.store.mergeRemoteChanges(() => {
      for (const dto of texts) {
        const shape = existing.get(dto.id);
        const props = flatten(dto);
        if (shape) {
          if (!samePropsAsDto(shape, dto)) {
            editor.updateShape<PageTextShape>({
              id: shape.id,
              type: 'page-text',
              x: dto.x,
              y: dto.y,
              props,
            });
          }
          existing.delete(dto.id);
        } else {
          editor.createShape<PageTextShape>({
            id: shapeId(`ptext-${dto.id}`),
            type: 'page-text',
            x: dto.x,
            y: dto.y,
            props,
          });
        }
      }
      for (const orphan of existing.values()) {
        editor.deleteShape(orphan.id);
      }
    });
  }, [editor, texts]);

  useShapeSync<PageTextShape, PageTextDTO>(SPEC, {
    editor,
    pageId,
    onItemsChanged: onTextsChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<PageTextShape, PageTextDTO> = {
  type: 'page-text',
  idProp: 'textId',
  listPath: ApiPaths.pagePageTexts,
  itemPath: ApiPaths.pageText,
  toBody: toApi,
};
