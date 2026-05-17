'use client';
import { createShapeId } from 'tldraw';
import type { ComicPanelShape } from './comic-panel-shape';
import { PolygonDrawingTool, type PolygonCommitArgs } from './polygon-tool-base';

/**
 * 자유 polygon 패널 도구.
 * - 빈 캔버스 클릭: vertex 추가.
 * - 첫 vertex 근처 클릭 또는 더블클릭/Enter: 닫고 comic-panel(variant='polygon') 생성.
 * - Escape: 취소.
 */
export class PolygonPanelTool extends PolygonDrawingTool {
  static override id = 'polygon-panel';
  static override initial = 'polygon-panel';

  protected commitPolygon({ bbox, normalized }: PolygonCommitArgs): void {
    this.editor.createShape<ComicPanelShape>({
      id: createShapeId(),
      type: 'comic-panel',
      x: bbox.x,
      y: bbox.y,
      props: {
        w: bbox.w,
        h: bbox.h,
        panelId: null,
        status: null,
        resultImageUrl: null,
        variant: 'polygon',
        polygonPoints: normalized,
      },
    });
  }
}
