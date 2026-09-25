'use client';
import {
  StateNode,
  createShapeId,
  type Editor,
  type TLShapeId,
  type TLStateNodeConstructor,
} from 'tldraw';
import {
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
  type SpeechBubbleVariant,
} from '@comicai/types';
import type { SpeechBubbleShape } from './speech-bubble-shape';
import { PolygonDrawingTool, type PolygonCommitArgs } from './polygon-tool-base';

type BoxVariant = Exclude<SpeechBubbleVariant, 'polygon'>;

/** click-only로 만들 때의 기본 크기. drag로 만들면 사용자가 정한 bbox 사용. */
const CLICK_DEFAULT_W = 160;
const CLICK_DEFAULT_H = 100;

function defaultBubbleProps(): Omit<SpeechBubbleShape['props'], 'variant' | 'w' | 'h'> {
  return {
    bubbleId: null,
    polygonPoints: null,
    tailX: null,
    tailY: null,
    ...defaultSpeechBubbleStyle(),
    text: '',
    fontSize: defaultPageTextStyle().fontSize,
    fontFamily: defaultPageTextStyle().fontFamily,
    textColor: defaultPageTextStyle().color,
    textAlign: defaultPageTextStyle().textAlign,
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
    openEditingNextFrame(editor, id);
  };
  window.addEventListener('pointerup', run, true);
}

/**
 * 도구가 `select` 로 돌아간 **다음 프레임**에 편집을 연다.
 *
 * 다각형은 꼭짓점을 다 찍은 순간 동기적으로 만들어지는데, 그 직후 베이스가
 * `setCurrentTool('select')` 로 덮는다. 같은 틱에 편집을 열면 그 호출에 지워진다.
 */
function openEditingNextFrame(editor: Editor, id: TLShapeId): void {
  requestAnimationFrame(() => {
    if (!editor.getShape(id)) return;
    editor.select(id);
    editor.setEditingShape(id);
    editor.setCurrentTool('select.editing_shape');
  });
}

class BubbleBoxIdle extends StateNode {
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

/**
 * tldraw 기본 BaseBoxShapeTool은 drag 경로만 `onCreate`를 호출해 variant 패치가 들어간다.
 * click-only (drag 없음) 케이스에선 `Pointing.complete()`이 호출되어 default props 그대로
 * shape이 만들어지므로 어떤 도구를 골라도 항상 `getDefaultProps()`의 variant(ellipse)로 생성됐다.
 * → click 경로와 drag 경로 모두에서 createShape 시점에 직접 variant를 박도록 자체 구현한다.
 */
class BubbleBoxPointing extends StateNode {
  static override id = 'pointing';

  private get variant(): BoxVariant {
    return (this.parent as BubbleBoxToolBase).variant;
  }

  override onPointerMove(): void {
    if (!this.editor.inputs.isDragging) return;
    const { originPagePoint } = this.editor.inputs;
    const id = createShapeId();
    const markId = this.editor.markHistoryStoppingPoint(`creating_bubble:${id}`);
    this.editor.createShape<SpeechBubbleShape>({
      id,
      type: 'speech-bubble',
      x: originPagePoint.x,
      y: originPagePoint.y,
      props: { ...defaultBubbleProps(), w: 1, h: 1, variant: this.variant },
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
    this.editor.markHistoryStoppingPoint(`creating_bubble_click`);
    const id = createShapeId();
    this.editor.createShape<SpeechBubbleShape>({
      id,
      type: 'speech-bubble',
      x: originPagePoint.x - CLICK_DEFAULT_W / 2,
      y: originPagePoint.y - CLICK_DEFAULT_H / 2,
      props: {
        ...defaultBubbleProps(),
        w: CLICK_DEFAULT_W,
        h: CLICK_DEFAULT_H,
        variant: this.variant,
      },
    });
    /*
     * 풍선을 그렸으면 다음에 할 일은 대사를 쓰는 것이다 — 바로 편집으로 연다.
     * 빈 풍선만 필요하면 Esc 한 번이면 빠져나온다.
     */
    this.editor.select(id);
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

abstract class BubbleBoxToolBase extends StateNode {
  static override initial = 'idle';
  static override children(): TLStateNodeConstructor[] {
    return [BubbleBoxIdle, BubbleBoxPointing];
  }
  abstract readonly variant: BoxVariant;
}

class BubbleEllipseTool extends BubbleBoxToolBase {
  static override id = 'bubble-ellipse';
  readonly variant = 'ellipse' as const;
}
class BubbleRectTool extends BubbleBoxToolBase {
  static override id = 'bubble-rect';
  readonly variant = 'rect' as const;
}
class BubbleSpikeTool extends BubbleBoxToolBase {
  static override id = 'bubble-spike';
  readonly variant = 'spike' as const;
}

class BubblePolygonTool extends PolygonDrawingTool {
  static override id = 'bubble-polygon';
  static override initial = 'bubble-polygon';

  protected commitPolygon({ bbox, normalized }: PolygonCommitArgs): void {
    const id = createShapeId();
    this.editor.createShape<SpeechBubbleShape>({
      id,
      type: 'speech-bubble',
      x: bbox.x,
      y: bbox.y,
      props: {
        ...defaultBubbleProps(),
        w: bbox.w,
        h: bbox.h,
        variant: 'polygon',
        polygonPoints: normalized,
      },
    });
    // 다른 풍선과 같게 — 다 찍고 나면 바로 대사를 쓴다.
    openEditingNextFrame(this.editor, id);
  }
}

export const ALL_BUBBLE_TOOLS = [
  BubbleEllipseTool,
  BubbleRectTool,
  BubbleSpikeTool,
  BubblePolygonTool,
] as const;
