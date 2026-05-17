'use client';
import { StateNode, type TLKeyboardEventInfo } from 'tldraw';
import { pointsBoundingBox } from '@comicai/types';
import {
  polygonHoverAtom,
  polygonPointsAtom,
  resetPolygonState,
  type Point,
} from './polygon-state';

/** 첫 vertex 근처를 클릭하면 닫는 거리(화면 픽셀 기준). */
const CLOSE_HIT_SCREEN_PX = 12;
const MIN_VERTICES = 3;

export interface PolygonCommitArgs {
  /** 페이지 좌표계의 vertex들 (>= 3개). */
  points: Point[];
  /** bbox(좌상단 x/y + w/h). vertex bounding box. */
  bbox: { x: number; y: number; w: number; h: number };
  /** bbox에 대해 0..1로 정규화한 vertex. shape 저장용. */
  normalized: { x: number; y: number }[];
}

/**
 * polygon 그리기 도구의 공통 인터랙션 (점 누적 → 닫기 → bbox 산정).
 * 서브클래스는 `id`와 `commitPolygon`만 정의하면 된다.
 */
export abstract class PolygonDrawingTool extends StateNode {
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
        this.tryCommit(points);
        return;
      }
    }
    polygonPointsAtom.set([...points, next]);
  }

  override onDoubleClick(): void {
    this.tryCommit(polygonPointsAtom.get());
  }

  override onKeyDown(info: TLKeyboardEventInfo): void {
    if (info.key === 'Escape') {
      this.editor.setCurrentTool('select');
    } else if (info.key === 'Enter') {
      this.tryCommit(polygonPointsAtom.get());
    } else if (info.key === 'Backspace' || info.key === 'Delete') {
      const points = polygonPointsAtom.get();
      if (points.length > 0) polygonPointsAtom.set(points.slice(0, -1));
    }
  }

  override onCancel(): void {
    this.editor.setCurrentTool('select');
  }

  private tryCommit(points: Point[]): void {
    if (points.length < MIN_VERTICES) {
      this.editor.setCurrentTool('select');
      return;
    }
    const bbox = pointsBoundingBox(points);
    const w = Math.max(1, bbox.w);
    const h = Math.max(1, bbox.h);
    const normalized = points.map((p) => ({ x: (p.x - bbox.x) / w, y: (p.y - bbox.y) / h }));
    this.commitPolygon({ points, bbox: { x: bbox.x, y: bbox.y, w, h }, normalized });
    this.editor.setCurrentTool('select');
  }

  /** 서브클래스 — bbox/normalized로 shape 생성 후 도구는 베이스가 select로 복귀시킨다. */
  protected abstract commitPolygon(args: PolygonCommitArgs): void;
}
