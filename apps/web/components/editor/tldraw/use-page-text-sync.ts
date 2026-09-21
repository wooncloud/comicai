'use client';
import type { Editor } from 'tldraw';
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
  const style = { ...defaultPageTextStyle(), ...t.style };
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

function samePropsAsDto(
  shape: PageTextShape,
  next: { x: number; y: number; props: PageTextShape['props'] },
): boolean {
  const cur = shape.props;
  const n = next.props;
  return (
    shape.x === next.x &&
    shape.y === next.y &&
    cur.w === n.w &&
    cur.h === n.h &&
    cur.text === n.text &&
    cur.fontSize === n.fontSize &&
    cur.fontFamily === n.fontFamily &&
    cur.color === n.color &&
    cur.textAlign === n.textAlign
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
  useShapeSync<PageTextShape, PageTextDTO>(SPEC, {
    editor,
    pageId,
    items: texts,
    onItemsChanged: onTextsChanged,
    onSavingChange,
    onSaveError,
  });
}

/** 모듈 상수여야 한다 — useShapeSync 의 의존성 배열에 들어간다. */
const SPEC: ShapeSyncSpec<PageTextShape, PageTextDTO> = {
  type: 'page-text',
  idProp: 'textId',
  shapeIdPrefix: 'ptext',
  listPath: ApiPaths.pagePageTexts,
  itemPath: ApiPaths.pageText,
  toBody: toApi,
  toShape: (dto) => ({
    x: dto.x,
    y: dto.y,
    props: flatten(dto),
  }),
  isEqual: samePropsAsDto,
};
