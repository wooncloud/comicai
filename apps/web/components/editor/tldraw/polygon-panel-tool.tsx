'use client';
import { StateNode, createShapeId, type TLKeyboardEventInfo } from 'tldraw';
import { pointsBoundingBox } from '@comicai/types';
import type { ComicPanelShape } from './comic-panel-shape';
import {
  polygonHoverAtom,
  polygonPointsAtom,
  resetPolygonState,
  type Point,
} from './polygon-state';

/** 첫 vertex 근처를 클릭하면 닫는 거리(화면 픽셀 기준). */
const CLOSE_HIT_SCREEN_PX = 12;
const MIN_VERTICES = 3;

/**
 * 자유 polygon 패널 도구.
 * - 빈 캔버스 클릭: vertex 추가.
 * - 첫 vertex 근처 클릭 또는 더블클릭/Enter: 닫고 comic-panel(variant='polygon') 생성.
 * - Escape: 취소.
 */
export class PolygonPanelTool extends StateNode {
  static override id = 'polygon-panel';
  static override initial = 'polygon-panel';

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
      // 충분치 않으면 잠자코 취소 — 사용자가 도구는 빠져나오게.
      this.editor.setCurrentTool('select');
      return;
    }
    const bbox = pointsBoundingBox(points);
    const w = Math.max(1, bbox.w);
    const h = Math.max(1, bbox.h);
    const normalized = points.map((p) => ({ x: (p.x - bbox.x) / w, y: (p.y - bbox.y) / h }));
    this.editor.createShape<ComicPanelShape>({
      id: createShapeId(),
      type: 'comic-panel',
      x: bbox.x,
      y: bbox.y,
      props: {
        w,
        h,
        panelId: null,
        status: null,
        resultImageUrl: null,
        variant: 'polygon',
        polygonPoints: normalized,
      },
    });
    this.editor.setCurrentTool('select');
  }
}
