'use client';
import { BaseBoxShapeTool, createShapeId } from 'tldraw';
import type { SpeechBubbleVariant } from '@comicai/types';
import type { SpeechBubbleShape } from './speech-bubble-shape';
import { PolygonDrawingTool, type PolygonCommitArgs } from './polygon-tool-base';

type BoxVariant = Exclude<SpeechBubbleVariant, 'polygon'>;

/**
 * variant별 box drag 도구의 공통 베이스.
 * tldraw가 BaseBoxShapeTool.shapeType으로 새 shape를 만들 때 getDefaultProps를 사용하므로,
 * 각 도구는 onCreate에서 variant만 덮어쓰면 된다.
 */
abstract class BubbleBoxToolBase extends BaseBoxShapeTool {
  static override initial = 'idle';
  override shapeType = 'speech-bubble';
  protected abstract readonly variant: BoxVariant;

  override onCreate(shape: SpeechBubbleShape | null): void {
    if (!shape) return;
    this.editor.updateShape<SpeechBubbleShape>({
      id: shape.id,
      type: 'speech-bubble',
      props: { ...shape.props, variant: this.variant },
    });
    this.editor.setCurrentTool('select');
  }
}

export class BubbleEllipseTool extends BubbleBoxToolBase {
  static override id = 'bubble-ellipse';
  protected readonly variant = 'ellipse' as const;
}
export class BubbleRectTool extends BubbleBoxToolBase {
  static override id = 'bubble-rect';
  protected readonly variant = 'rect' as const;
}
export class BubbleCloudTool extends BubbleBoxToolBase {
  static override id = 'bubble-cloud';
  protected readonly variant = 'cloud' as const;
}
export class BubbleSpikeTool extends BubbleBoxToolBase {
  static override id = 'bubble-spike';
  protected readonly variant = 'spike' as const;
}
export class BubbleThoughtTool extends BubbleBoxToolBase {
  static override id = 'bubble-thought';
  protected readonly variant = 'thought' as const;
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
        w: bbox.w,
        h: bbox.h,
        bubbleId: null,
        variant: 'polygon',
        polygonPoints: normalized,
        tailX: null,
        tailY: null,
        text: '',
        fontSize: 14,
        strokeWidth: 2,
        strokeColor: '#000000',
        fillColor: '#ffffff',
        textAlign: 'center',
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
