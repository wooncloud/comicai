'use client';
import { StateNode, createShapeId, type TLStateNodeConstructor } from 'tldraw';
import type { SpeechBubbleVariant } from '@comicai/types';
import type { SpeechBubbleShape } from './speech-bubble-shape';
import { PolygonDrawingTool, type PolygonCommitArgs } from './polygon-tool-base';
import { boxToolStates, openEditingNextFrame } from './box-tool';

type BoxVariant = Exclude<SpeechBubbleVariant, 'polygon'>;

/** 네 모양의 풍선 도구가 같은 두 상태를 쓴다. 다른 것은 `variant` 하나다. */
const STATES = boxToolStates({
  shapeType: 'speech-bubble',
  clickSize: { w: 160, h: 100 },
  props: (tool) => ({ variant: (tool as BubbleBoxToolBase).variant }),
});

abstract class BubbleBoxToolBase extends StateNode {
  static override initial = 'idle';
  static override children(): TLStateNodeConstructor[] {
    return STATES;
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
      props: { w: bbox.w, h: bbox.h, variant: 'polygon', polygonPoints: normalized },
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
