'use client';
import { StateNode, createShapeId, type TLStateNodeConstructor } from 'tldraw';
import type { PageLineShape } from './page-line-shape';

/** drag로 두 점을 지정해 만든다. click(드래그 거의 없음)은 무시. */
const MIN_DRAG_PX = 4;

function defaultLineProps(): Omit<
  PageLineShape['props'],
  'w' | 'h' | 'x1Norm' | 'y1Norm' | 'x2Norm' | 'y2Norm'
> {
  return {
    lineId: null,
    strokeWidth: 2,
    strokeColor: '#111111',
    strokeStyle: 'solid',
  };
}

class PageLineIdle extends StateNode {
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

class PageLinePointing extends StateNode {
  static override id = 'pointing';

  override onPointerMove(): void {
    if (!this.editor.inputs.isDragging) return;
    this.parent.transition('dragging');
  }

  override onPointerUp(): void {
    // 드래그 없는 단일 클릭은 무시(line은 길이 0이 무의미).
    this.parent.transition('idle');
  }

  override onCancel(): void {
    this.parent.transition('idle');
  }
}

class PageLineDragging extends StateNode {
  static override id = 'dragging';

  shapeId: ReturnType<typeof createShapeId> | null = null;
  markId: string | null = null;
  origin: { x: number; y: number } = { x: 0, y: 0 };

  override onEnter(): void {
    const { originPagePoint, currentPagePoint, shiftKey } = this.editor.inputs;
    const end = shiftKey ? snapAxis(originPagePoint, currentPagePoint) : currentPagePoint;
    this.origin = { x: originPagePoint.x, y: originPagePoint.y };
    const id = createShapeId();
    this.shapeId = id;
    this.markId = this.editor.markHistoryStoppingPoint(`creating_page_line:${id}`);
    const placed = computeBox(this.origin, end);
    this.editor.createShape<PageLineShape>({
      id,
      type: 'page-line',
      x: placed.x,
      y: placed.y,
      props: { ...defaultLineProps(), ...placed.dims },
    });
    this.editor.select(id);
  }

  override onPointerMove(): void {
    if (!this.shapeId) return;
    const { currentPagePoint, shiftKey } = this.editor.inputs;
    const end = shiftKey ? snapAxis(this.origin, currentPagePoint) : currentPagePoint;
    const placed = computeBox(this.origin, end);
    this.editor.updateShape<PageLineShape>({
      id: this.shapeId,
      type: 'page-line',
      x: placed.x,
      y: placed.y,
      props: { ...this.editor.getShape<PageLineShape>(this.shapeId)!.props, ...placed.dims },
    });
  }

  override onPointerUp(): void {
    this.finish();
  }

  override onCancel(): void {
    if (this.shapeId && this.markId) {
      this.editor.bailToMark(this.markId);
    }
    this.shapeId = null;
    this.markId = null;
    this.parent.transition('idle');
  }

  private finish(): void {
    if (!this.shapeId) return;
    const shape = this.editor.getShape<PageLineShape>(this.shapeId);
    if (!shape) {
      this.shapeId = null;
      this.markId = null;
      this.parent.transition('idle');
      return;
    }
    // 너무 짧으면 무효화.
    const dx = (shape.props.x2Norm - shape.props.x1Norm) * shape.props.w;
    const dy = (shape.props.y2Norm - shape.props.y1Norm) * shape.props.h;
    if (Math.hypot(dx, dy) < MIN_DRAG_PX && this.markId) {
      this.editor.bailToMark(this.markId);
      this.shapeId = null;
      this.markId = null;
      this.parent.transition('idle');
      return;
    }
    this.shapeId = null;
    this.markId = null;
    this.editor.setCurrentTool('select');
  }
}

/** bbox + 두 끝점 normalized 좌표 계산. 직선이라 bbox 가 0인 축은 1로 보정. */
function computeBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
): {
  x: number;
  y: number;
  dims: {
    w: number;
    h: number;
    x1Norm: number;
    y1Norm: number;
    x2Norm: number;
    y2Norm: number;
  };
} {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const x1Norm = (a.x - minX) / w;
  const y1Norm = (a.y - minY) / h;
  const x2Norm = (b.x - minX) / w;
  const y2Norm = (b.y - minY) / h;
  return { x: minX, y: minY, dims: { w, h, x1Norm, y1Norm, x2Norm, y2Norm } };
}

/** Shift 누르면 시작점 기준 수평/수직/45° 로 스냅. */
function snapAxis(
  origin: { x: number; y: number },
  cur: { x: number; y: number },
): { x: number; y: number } {
  const dx = cur.x - origin.x;
  const dy = cur.y - origin.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 1 && absY < 1) return cur;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const len = Math.hypot(dx, dy);
  return { x: origin.x + Math.cos(snapped) * len, y: origin.y + Math.sin(snapped) * len };
}

export class PageLineTool extends StateNode {
  static override id = 'page-line';
  static override initial = 'idle';
  static override children(): TLStateNodeConstructor[] {
    return [PageLineIdle, PageLinePointing, PageLineDragging];
  }
}
