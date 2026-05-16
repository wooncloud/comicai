'use client';
import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLBaseShape } from 'tldraw';
import { PanelStatusBadge } from '../panel-status-badge';
import { RENDER_STATUSES, type RenderStatus } from '@comicai/types';

export type ComicPanelShape = TLBaseShape<
  'comic-panel',
  {
    w: number;
    h: number;
    /** 백엔드 패널 id. null이면 신규로 막 만든 상태 — 다음 sync에서 채워짐. */
    panelId: string | null;
    status: RenderStatus | null;
    resultImageUrl: string | null;
  }
>;

export class ComicPanelShapeUtil extends BaseBoxShapeUtil<ComicPanelShape> {
  static override type = 'comic-panel' as const;
  static override props: RecordProps<ComicPanelShape> = {
    w: T.number,
    h: T.number,
    panelId: T.string.nullable(),
    status: T.literalEnum(...RENDER_STATUSES).nullable(),
    resultImageUrl: T.string.nullable(),
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    return false;
  }

  getDefaultProps(): ComicPanelShape['props'] {
    return { w: 200, h: 240, panelId: null, status: null, resultImageUrl: null };
  }

  override component(shape: ComicPanelShape) {
    const { w, h, status, resultImageUrl } = shape.props;
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          border: '2px solid hsl(var(--foreground))',
          borderRadius: 6,
          background: resultImageUrl
            ? `url(${resultImageUrl}) center/cover no-repeat`
            : 'hsl(var(--card))',
          pointerEvents: 'all',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {status && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              pointerEvents: 'none',
            }}
          >
            <PanelStatusBadge status={status} />
          </div>
        )}
      </HTMLContainer>
    );
  }

  override indicator(shape: ComicPanelShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />;
  }
}
