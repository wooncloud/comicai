'use client';
import { StateNode, createShapeId, type TLStateNodeConstructor } from 'tldraw';
import type { PageTextShape } from './page-text-shape';

/** click-only로 만들 때의 기본 크기. drag로 만들면 사용자가 정한 bbox 사용. */
const CLICK_DEFAULT_W = 200;
const CLICK_DEFAULT_H = 60;

function defaultPageTextProps(): Omit<PageTextShape['props'], 'w' | 'h'> {
  return {
    textId: null,
    text: '',
    fontSize: 24,
    fontFamily: 'sans-serif',
    color: '#111111',
    textAlign: 'left',
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
    this.editor.setCurrentTool('select');
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
