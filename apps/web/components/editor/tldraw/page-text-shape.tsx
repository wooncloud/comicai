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
  defaultPageTextStyle,
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
      // 스타일 기본값은 packages/types 가 단일 출처다.
      ...defaultPageTextStyle(),
    };
  }

  /**
   * 드래그로 **새로 그린** 도형이면 리사이즈가 끝나는 순간 편집을 연다.
   *
   * 클릭 생성은 도구가 직접 편집으로 보내지만, 드래그 생성은 `select.resizing` 을
   * 거쳐 끝나므로 도구에는 끝났다는 신호가 오지 않는다. 그래서 드래그로 그린
   * 풍선·텍스트만 빈 채로 남고 사용자가 다시 더블클릭해야 했다.
   *
   * "아직 저장된 적 없고(id 가 null) 글자가 비어 있다" 로 새로 그린 것만 고른다 —
   * 이미 쓴 것을 크기만 바꾼 경우에는 편집이 열리지 않는다.
   */
  override onResizeEnd(initial: PageTextShape, current: PageTextShape): void {
    if (current.props.textId !== null) return;
    if (current.props.text !== '') return;
    this.editor.setEditingShape(current.id);
    this.editor.setCurrentTool('select.editing_shape');
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

  /*
   * 외부 변경(DTO sync, 인스펙터에서 다른 필드 변경 후 re-render)만 textContent 에 반영.
   *
   * **편집 중에는 건드리지 않는다.** POST 응답 뒤의 refetch 가 조금 전 본문을 들고
   * 오는데, 그 사이 사용자가 이어 친 글자가 여기서 지워지고 캐럿이 앞으로 튀었다.
   * 편집이 끝나면 `isEditing` 이 false 가 되면서 이 이펙트가 다시 돌아 맞춰진다.
   */
  useLayoutEffect(() => {
    if (isEditing) return;
    const el = editableRef.current;
    if (!el) return;
    if (el.textContent !== text) {
      el.textContent = text;
    }
  }, [text, isEditing]);

  /*
   * 편집이 시작되면 **실제로 캐럿을 준다.**
   *
   * tldraw 는 "이 도형이 편집 중" 이라는 상태만 바꾼다. 어느 요소에 포커스를 둘지는
   * 도형이 정하는데, 그걸 아무도 안 하고 있었다. 그래서 `contentEditable` 이 켜져도
   * 키 입력이 아무 데도 안 들어갔다 — 더블클릭해서 편집을 열어도 글자가 안 쳐지고,
   * 사용자는 상자를 한 번 더 클릭해야 한다는 걸 스스로 알아내야 했다.
   *
   * 캐럿은 끝에 둔다. 이미 쓰던 글을 고치려고 연 경우 앞으로 튀면 안 된다.
   */
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
    // 바뀐 키만. `updateShape` 는 props 를 부분 병합하므로 스프레드하면 낡은
    // 스냅샷(특히 아직 null 인 textId)을 되쓰게 된다.
    util.editor.updateShape<PageTextShape>({
      id: shape.id,
      type: 'page-text',
      props: { text: sliced },
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
          inset: 0,
          padding: '2px',
          display: 'flex',
          // 세로도 가운데 — 말풍선 안에 놓였을 때 풍선 중앙에 오게 한다.
          alignItems: 'center',
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
