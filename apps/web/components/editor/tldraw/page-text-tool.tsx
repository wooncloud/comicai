'use client';
import {
  StateNode,
  createShapeId,
  type Editor,
  type TLShapeId,
  type TLStateNodeConstructor,
} from 'tldraw';
import { defaultPageTextStyle } from '@comicai/types';
import type { PageTextShape } from './page-text-shape';

/** click-only로 만들 때의 기본 크기. drag로 만들면 사용자가 정한 bbox 사용. */
const CLICK_DEFAULT_W = 200;
const CLICK_DEFAULT_H = 60;

/**
 * 스타일 기본값은 `packages/types` 가 단일 출처다 — 여기에 값을 다시 적지 않는다.
 *
 * 예전에는 이 함수가 fontSize/색/정렬을 직접 박아 두어서, 공용 기본값을 바꿔도
 * **도구로 새로 만든 텍스트에는 반영되지 않았다.** 기존 텍스트만 바뀌고 새 텍스트는
 * 옛 값으로 태어나, 같은 페이지 안에서 정렬이 달라졌다.
 */
function defaultPageTextProps(): Omit<PageTextShape['props'], 'w' | 'h'> {
  return {
    textId: null,
    text: '',
    ...defaultPageTextStyle(),
  };
}

/**
 * 드래그로 새로 그린 도형을 **손을 뗀 뒤** 편집으로 연다.
 *
 * 클릭 생성은 도구가 그 자리에서 편집으로 보내면 된다. 드래그 생성은 `select.resizing`
 * 으로 넘어가 거기서 끝나므로 도구에는 끝났다는 신호가 오지 않는다. `ShapeUtil.onResizeEnd`
 * 도 **생성 드래그에서는 불리지 않는다** — 운영에서 확인했다. 그래서 다음 pointerup 을
 * 한 번만 듣는다.
 *
 * 드래그 도중 취소되면 도형이 없으므로 `getShape` 로 거른다.
 */
function openEditingAfterDrag(editor: Editor, id: TLShapeId): void {
  const run = () => {
    window.removeEventListener('pointerup', run, true);
    // 리사이즈 상태가 정리된 다음 프레임에 연다.
    requestAnimationFrame(() => {
      if (!editor.getShape(id)) return;
      editor.select(id);
      editor.setEditingShape(id);
      editor.setCurrentTool('select.editing_shape');
    });
  };
  window.addEventListener('pointerup', run, true);
}

class PageTextIdle extends StateNode {
  static override id = 'idle';
  override onEnter(): void {
    this.editor.setCursor({ type: 'cross', rotation: 0 });
  }
  override onPointerDown(): void {
    this.parent.transition('pointing');
  }
  override onCancel(): void {
    this.editor.setCurrentTool('select');
  }
}

class PageTextPointing extends StateNode {
  static override id = 'pointing';

  override onPointerMove(): void {
    if (!this.editor.inputs.isDragging) return;
    const { originPagePoint } = this.editor.inputs;
    const id = createShapeId();
    const markId = this.editor.markHistoryStoppingPoint(`creating_page_text:${id}`);
    this.editor.createShape<PageTextShape>({
      id,
      type: 'page-text',
      x: originPagePoint.x,
      y: originPagePoint.y,
      props: { ...defaultPageTextProps(), w: 1, h: 1 },
    });
    this.editor.select(id);
    this.editor.setCurrentTool('select.resizing', {
      target: 'selection',
      handle: 'bottom_right',
      isCreating: true,
      creatingMarkId: markId,
      creationCursorOffset: { x: 1, y: 1 },
    });
    openEditingAfterDrag(this.editor, id);
  }

  override onPointerUp(): void {
    const { originPagePoint } = this.editor.inputs;
    this.editor.markHistoryStoppingPoint(`creating_page_text_click`);
    const id = createShapeId();
    this.editor.createShape<PageTextShape>({
      id,
      type: 'page-text',
      x: originPagePoint.x - CLICK_DEFAULT_W / 2,
      y: originPagePoint.y - CLICK_DEFAULT_H / 2,
      props: { ...defaultPageTextProps(), w: CLICK_DEFAULT_W, h: CLICK_DEFAULT_H },
    });
    this.editor.select(id);
    /*
     * 만들자마자 글자를 칠 수 있어야 한다.
     *
     * 예전에는 상자만 만들고 select 로 돌아갔다. 화면에는 빈 상자가 생겼는데
     * 타이핑은 아무 데도 안 들어가서, 사용자는 도구를 바꾸고 더블클릭해야
     * 한다는 걸 스스로 알아내야 했다. 빈 텍스트 상자만 남기고 떠나기 십상이다.
     */
    this.editor.setEditingShape(id);
    this.editor.setCurrentTool('select.editing_shape');
  }

  override onCancel(): void {
    this.parent.transition('idle');
  }
  override onInterrupt(): void {
    this.parent.transition('idle');
  }
}

export class PageTextTool extends StateNode {
  static override id = 'page-text';
  static override initial = 'idle';
  static override children(): TLStateNodeConstructor[] {
    return [PageTextIdle, PageTextPointing];
  }
}
