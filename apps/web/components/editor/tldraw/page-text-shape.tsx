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
  PAGE_TEXT_FONT_FAMILIES,
  TEXT_ALIGNS,
  type PageTextFontFamily,
  type TextAlign,
} from '@comicai/types';

export type PageTextShape = TLBaseShape<
  'page-text',
  {
    w: number;
    h: number;
    /** 백엔드 id. null이면 신규로 막 만든 상태 — 다음 sync에서 채워짐. */
    textId: string | null;
    text: string;
    fontSize: number;
    fontFamily: PageTextFontFamily;
    color: string;
    textAlign: TextAlign;
  }
>;

export class PageTextShapeUtil extends BaseBoxShapeUtil<PageTextShape> {
  static override type = 'page-text' as const;
  static override props: RecordProps<PageTextShape> = {
    w: T.number,
    h: T.number,
    textId: T.string.nullable(),
    text: T.string,
    fontSize: T.number,
    fontFamily: T.literalEnum(...PAGE_TEXT_FONT_FAMILIES),
    color: T.string,
    textAlign: T.literalEnum(...TEXT_ALIGNS),
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

  getDefaultProps(): PageTextShape['props'] {
    return {
      w: 200,
      h: 60,
      textId: null,
      text: '',
      fontSize: 24,
      fontFamily: 'sans-serif',
      color: '#111111',
      textAlign: 'left',
    };
  }

  override component(shape: PageTextShape) {
    return <PageTextBody shape={shape} util={this} />;
  }

  override indicator(shape: PageTextShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

function PageTextBody({ shape, util }: { shape: PageTextShape; util: PageTextShapeUtil }) {
  const isEditing = useIsEditing(shape.id);
  const { w, h, text, fontSize, fontFamily, color, textAlign } = shape.props;

  const editableRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  // 외부 변경(예: DTO sync, 인스펙터에서 다른 필드 변경 후 re-render)만 textContent 에 반영.
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
    util.editor.updateShape<PageTextShape>({
      id: shape.id,
      type: 'page-text',
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
          if (composingRef.current) return;
          commit(e.currentTarget.textContent ?? '');
        }}
        onPointerDown={(e) => {
          if (isEditing) e.stopPropagation();
        }}
        style={{
          position: 'absolute',
          inset: 0,
          padding: '2px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent:
            textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
          textAlign,
          fontSize,
          fontFamily,
          lineHeight: 1.25,
          color,
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
