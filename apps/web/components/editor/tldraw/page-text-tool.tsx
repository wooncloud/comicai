'use client';
import { StateNode, createShapeId, type TLStateNodeConstructor } from 'tldraw';
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
