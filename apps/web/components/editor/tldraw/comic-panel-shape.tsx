'use client';
import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLBaseShape } from 'tldraw';
import { PanelStatusBadge } from '../panel-status-badge';
import {
  RENDER_STATUSES,
  PANEL_SHAPE_TYPES,
  isInProgressRender,
  type PanelShapeType,
  type RenderStatus,
} from '@comicai/types';
import { clipPathFor, outlinePathFor, type NormalizedPoint } from './panel-geometry';

export type ComicPanelShape = TLBaseShape<
  'comic-panel',
  {
    w: number;
    h: number;
    /** 백엔드 패널 id. null이면 신규로 막 만든 상태 — 다음 sync에서 채워짐. */
    panelId: string | null;
    status: RenderStatus | null;
    resultImageUrl: string | null;
    variant: PanelShapeType;
    /** variant='polygon'일 때 vertex들. [0,1] 정규화 좌표(bbox 기준). */
    polygonPoints: NormalizedPoint[] | null;
    /** 외곽선 색/굵기. PanelShape 와 동기. */
    strokeColor: string;
    strokeWidth: number;
  }
>;

const NormalizedPointSchema = T.object({ x: T.number, y: T.number });

export class ComicPanelShapeUtil extends BaseBoxShapeUtil<ComicPanelShape> {
  static override type = 'comic-panel' as const;
  static override props: RecordProps<ComicPanelShape> = {
    w: T.number,
    h: T.number,
    panelId: T.string.nullable(),
    status: T.literalEnum(...RENDER_STATUSES).nullable(),
    resultImageUrl: T.string.nullable(),
    variant: T.literalEnum(...PANEL_SHAPE_TYPES),
    polygonPoints: T.arrayOf(NormalizedPointSchema).nullable(),
    strokeColor: T.string,
    strokeWidth: T.number,
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    return false;
  }

  getDefaultProps(): ComicPanelShape['props'] {
    return {
      w: 200,
      h: 240,
      panelId: null,
      status: null,
      resultImageUrl: null,
      variant: 'rect',
      polygonPoints: null,
      strokeColor: '#000000',
      strokeWidth: 2,
    };
  }

  override component(shape: ComicPanelShape) {
    const { w, h, status, resultImageUrl, variant, polygonPoints, strokeColor, strokeWidth } =
      shape.props;
    const inProgress = isInProgressRender(status);
    const clipPath = clipPathFor(variant, w, h, polygonPoints);
    const outline = outlinePathFor(variant, w, h, polygonPoints);
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          pointerEvents: 'all',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: resultImageUrl
              ? `url(${resultImageUrl}) center/cover no-repeat`
              : 'hsl(var(--card))',
            clipPath,
            WebkitClipPath: clipPath,
          }}
        />
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <path
            d={outline}
            fill="none"
            stroke={strokeColor || 'hsl(var(--foreground))'}
            strokeWidth={strokeWidth > 0 ? strokeWidth : 2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {inProgress && (
          <div
            className="animate-pulse"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background:
                'repeating-linear-gradient(45deg, rgba(59,130,246,0.08), rgba(59,130,246,0.08) 12px, rgba(59,130,246,0.16) 12px, rgba(59,130,246,0.16) 24px)',
              clipPath,
              WebkitClipPath: clipPath,
              pointerEvents: 'none',
            }}
          >
            <Spinner />
            <div
              style={{
                color: 'hsl(217 91% 35%)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              {status === 'queued' ? '대기 중…' : '생성 중…'}
            </div>
          </div>
        )}
        {status && !inProgress && (
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
    const { w, h, variant, polygonPoints } = shape.props;
    return <path d={outlinePathFor(variant, w, h, polygonPoints)} />;
  }
}

function Spinner() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="hsl(217 91% 60% / 0.25)" strokeWidth="3" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="hsl(217 91% 50%)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
