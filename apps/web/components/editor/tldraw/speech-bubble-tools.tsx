'use client';
import { BaseBoxShapeTool, StateNode, createShapeId, type TLKeyboardEventInfo } from 'tldraw';
import { pointsBoundingBox, type SpeechBubbleVariant } from '@comicai/types';
import type { SpeechBubbleShape } from './speech-bubble-shape';
import {
  polygonHoverAtom,
  polygonPointsAtom,
  resetPolygonState,
  type Point,
} from './polygon-state';

/**
 * variant별 box drag 도구. tldraw가 BaseBoxShapeTool.shapeType으로 새 shape를 만들 때
 * getDefaultProps를 사용하므로, 각 도구는 onCreate에서 variant만 덮어쓴다.
 */
abstract class BaseBubbleBoxTool extends BaseBoxShapeTool {
  static override initial = 'idle';
  override shapeType = 'speech-bubble';
  protected abstract variant: SpeechBubbleVariant;

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

export class BubbleEllipseTool extends BaseBubbleBoxTool {
  static override id = 'bubble-ellipse';
  protected variant: SpeechBubbleVariant = 'ellipse';
}
export class BubbleRectTool extends BaseBubbleBoxTool {
  static override id = 'bubble-rect';
  protected variant: SpeechBubbleVariant = 'rect';
}
export class BubbleCloudTool extends BaseBubbleBoxTool {
  static override id = 'bubble-cloud';
  protected variant: SpeechBubbleVariant = 'cloud';
}
export class BubbleSpikeTool extends BaseBubbleBoxTool {
  static override id = 'bubble-spike';
  protected variant: SpeechBubbleVariant = 'spike';
}
export class BubbleThoughtTool extends BaseBubbleBoxTool {
  static override id = 'bubble-thought';
  protected variant: SpeechBubbleVariant = 'thought';
}

/** polygon-panel-tool과 동일한 인터랙션. 점 누적 → 닫기. */
const CLOSE_HIT_SCREEN_PX = 12;
const MIN_VERTICES = 3;

export class BubblePolygonTool extends StateNode {
  static override id = 'bubble-polygon';
  static override initial = 'bubble-polygon';

  override onEnter(): void {
    this.editor.setCursor({ type: 'cross', rotation: 0 });
    resetPolygonState();
  }

  override onExit(): void {
    resetPolygonState();
  }

  override onPointerMove(): void {
    const p = this.editor.inputs.currentPagePoint;
    polygonHoverAtom.set({ x: p.x, y: p.y });
  }

  override onPointerDown(): void {
    const p = this.editor.inputs.currentPagePoint;
    const next: Point = { x: p.x, y: p.y };
    const points = polygonPointsAtom.get();
    const first = points[0];
    if (first && points.length >= MIN_VERTICES) {
      const zoom = this.editor.getZoomLevel();
      const distScreen = Math.hypot(next.x - first.x, next.y - first.y) * zoom;
      if (distScreen <= CLOSE_HIT_SCREEN_PX) {
        this.commit(points);
        return;
      }
    }
    polygonPointsAtom.set([...points, next]);
  }

  override onDoubleClick(): void {
    this.commit(polygonPointsAtom.get());
  }

  override onKeyDown(info: TLKeyboardEventInfo): void {
    if (info.key === 'Escape') {
      this.editor.setCurrentTool('select');
    } else if (info.key === 'Enter') {
      this.commit(polygonPointsAtom.get());
    } else if (info.key === 'Backspace' || info.key === 'Delete') {
      const points = polygonPointsAtom.get();
      if (points.length > 0) polygonPointsAtom.set(points.slice(0, -1));
    }
  }

  override onCancel(): void {
    this.editor.setCurrentTool('select');
  }

  private commit(points: Point[]): void {
    if (points.length < MIN_VERTICES) {
      this.editor.setCurrentTool('select');
      return;
    }
    const bbox = pointsBoundingBox(points);
    const w = Math.max(1, bbox.w);
    const h = Math.max(1, bbox.h);
    const normalized = points.map((p) => ({ x: (p.x - bbox.x) / w, y: (p.y - bbox.y) / h }));
    this.editor.createShape<SpeechBubbleShape>({
      id: createShapeId(),
      type: 'speech-bubble',
      x: bbox.x,
      y: bbox.y,
      props: {
        w,
        h,
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
    this.editor.setCurrentTool('select');
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
