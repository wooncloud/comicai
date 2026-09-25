'use client';
import { useCallback, useRef, type CSSProperties } from 'react';
import { useIsEditing, type TLShapeId } from 'tldraw';
import { MAX_CANVAS_TEXT_LENGTH, TEXT_LINE_HEIGHT, wrapText, type TextAlign } from '@comicai/types';

interface Props {
  shapeId: TLShapeId;
  /** 원문. 편집 칸이 열릴 때 이 값으로 시작한다. */
  text: string;
  /** 도형 안에서 글자가 들어갈 자리. 줄은 이 폭으로 끊는다. */
  box: { x: number; y: number; w: number; h: number };
  fontSize: number;
  fontFamily: string;
  color: string;
  textAlign: TextAlign;
  onCommit: (next: string) => void;
}

/**
 * 캔버스 위 글자 한 칸. 말풍선 대사와 자유 텍스트가 같이 쓴다.
 *
 * **보여 주는 칸과 편집 칸이 다른 요소다.** 편집 중이 아닐 때는 React 가 끊은 줄을
 * 그리고, 편집하는 동안에만 contentEditable 칸이 붙는다. 예전에는 한 요소를 React 와
 * 명령형 코드가 나눠 쥐었다 — 밖에서 값이 바뀌면 `textContent` 로 덮어쓰는 이펙트가,
 * 말풍선에서는 React 가 그린 줄들까지 매번 원문으로 덮어 React 가 모르는 DOM 이 됐다.
 * 이 코드는 두 도형에 한 줄씩 복사돼 있기도 했다.
 *
 * 편집 칸은 **붙는 순간에만** 원문을 넣는다. 편집 중에 밖에서 온 값(저장 뒤 재조회)으로
 * 덮으면, 그 사이 이어 친 글자가 지워지고 캐럿이 앞으로 튄다.
 */
export function EditableText({
  shapeId,
  text,
  box,
  fontSize,
  fontFamily,
  color,
  textAlign,
  onCommit,
}: Props) {
  const isEditing = useIsEditing(shapeId);
  const composing = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;

  /*
   * 편집 칸이 붙으면 원문을 넣고 **실제로 캐럿을 준다.** tldraw 는 "이 도형이 편집 중"
   * 이라는 상태만 바꾸고, 어느 요소에 포커스를 둘지는 도형이 정한다 — 아무도 안 하던
   * 때는 더블클릭으로 편집을 열어도 글자가 안 쳐졌다. 캐럿은 끝에 둔다. 쓰던 글을
   * 고치려고 연 경우 앞으로 튀면 안 된다.
   */
  const mountEditor = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    el.textContent = textRef.current;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  function commit(raw: string) {
    const next = raw.slice(0, MAX_CANVAS_TEXT_LENGTH);
    if (next !== textRef.current) onCommit(next);
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    display: 'flex',
    flexDirection: 'column',
    // 세로는 가운데 — 말풍선 안에 놓인 글이 풍선 천장에 붙지 않게. export 도 같다.
    justifyContent: 'center',
    alignItems: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
    textAlign,
    fontSize,
    fontFamily,
    lineHeight: TEXT_LINE_HEIGHT,
    color,
  };

  if (!isEditing) {
    /*
     * 줄은 `wrapText` 로 미리 끊는다 — **export 와 같은 함수·같은 폭이다.** CSS 로 접으면
     * 화면과 내보낸 PNG 의 줄 수가 달라진다(librsvg 에는 foreignObject 가 없어 export 는
     * CSS 로 접을 수 없다). 편집 중에는 원문 그대로 두므로 끊지 않는다.
     */
    const lines = wrapText(text, { maxWidth: box.w, fontSize });
    return (
      <div key="display" style={{ ...style, userSelect: 'none', pointerEvents: 'none' }}>
        {lines.map((l, i) => (
          // 줄은 이미 끊었다. 여기서 또 접으면 export 와 줄 수가 갈린다.
          <div key={i} style={{ whiteSpace: 'pre' }}>
            {l === '' ? ' ' : l}
          </div>
        ))}
      </div>
    );
  }

  /*
   * `key` 가 다르다 — 두 칸이 같은 자리의 `<div>` 라 React 가 DOM 을 **재사용**한다.
   * 그러면 편집 칸에 명령형으로 넣은 글자가 보여 주는 칸으로 넘어가, Esc 뒤에 원문과
   * 끊은 줄이 겹쳐 두 벌 보였다. 키를 갈라 편집이 열리고 닫힐 때마다 새로 붙게 한다.
   */
  return (
    <div
      key="editor"
      ref={mountEditor}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        commit(e.currentTarget.textContent);
      }}
      onInput={(e) => {
        // 한글 조합 중에는 올리지 않는다. 조합이 끝날 때 한 번.
        if (!composing.current) commit(e.currentTarget.textContent);
      }}
      // 편집 칸 안의 클릭이 캔버스로 넘어가 선택을 바꾸면 안 된다.
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...style,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        outline: '1px dashed rgba(0,0,0,0.3)',
        cursor: 'text',
        userSelect: 'text',
        pointerEvents: 'auto',
      }}
    />
  );
}
