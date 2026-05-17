'use client';
import { StateNode, createShapeId, type TLStateNodeConstructor } from 'tldraw';
import type { SpeechBubbleVariant } from '@comicai/types';
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
    text: '',
    fontSize: 14,
    strokeWidth: 2,
    strokeColor: '#000000',
    fillColor: '#ffffff',
    textAlign: 'center',
  };
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
  }

  override onPointerUp(): void {
    const { originPagePoint } = this.editor.inputs;
    this.editor.markHistoryStoppingPoint(`creating_bubble_click`);
    this.editor.createShape<SpeechBubbleShape>({
      id: createShapeId(),
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
    this.editor.setCurrentTool('select');
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

export class BubbleEllipseTool extends BubbleBoxToolBase {
  static override id = 'bubble-ellipse';
  readonly variant = 'ellipse' as const;
}
export class BubbleRectTool extends BubbleBoxToolBase {
  static override id = 'bubble-rect';
  readonly variant = 'rect' as const;
}
export class BubbleCloudTool extends BubbleBoxToolBase {
  static override id = 'bubble-cloud';
  readonly variant = 'cloud' as const;
}
export class BubbleSpikeTool extends BubbleBoxToolBase {
  static override id = 'bubble-spike';
  readonly variant = 'spike' as const;
}
export class BubbleThoughtTool extends BubbleBoxToolBase {
  static override id = 'bubble-thought';
  readonly variant = 'thought' as const;
}

export class BubblePolygonTool extends PolygonDrawingTool {
  static override id = 'bubble-polygon';
  static override initial = 'bubble-polygon';

  protected commitPolygon({ bbox, normalized }: PolygonCommitArgs): void {
    this.editor.createShape<SpeechBubbleShape>({
      id: createShapeId(),
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
  }
}

export const ALL_BUBBLE_TOOLS = [
  BubbleEllipseTool,
  BubbleRectTool,
  BubbleCloudTool,
  BubbleSpikeTool,
  BubbleThoughtTool,
  BubblePolygonTool,
] as const;
