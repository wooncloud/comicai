'use client';
import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLBaseShape } from 'tldraw';
import {
  defaultPageLineStyle,
  PAGE_LINE_STROKE_STYLES,
  type PageLineStrokeStyle,
} from '@comicai/types';

/**
 * BaseBoxShape 위에 두 끝점을 bbox 정규화 좌표(0..1)로 얹어 표현한다.
 * - shape.x, shape.y, props.w, props.h: bbox (resize/move에 사용)
 * - props.x1Norm/y1Norm/x2Norm/y2Norm: bbox 내 두 끝점 위치 (0..1)
 *
 * DB 저장 시에는 절대좌표(x1/y1/x2/y2)로 변환된다 (use-page-line-sync.ts).
 */
export type PageLineShape = TLBaseShape<
  'page-line',
  {
    w: number;
    h: number;
    /** 백엔드 id. null이면 신규로 막 만든 상태 — 다음 sync에서 채워짐. */
    lineId: string | null;
    x1Norm: number;
    y1Norm: number;
    x2Norm: number;
    y2Norm: number;
    strokeWidth: number;
    strokeColor: string;
    strokeStyle: PageLineStrokeStyle;
  }
>;

export class PageLineShapeUtil extends BaseBoxShapeUtil<PageLineShape> {
  static override type = 'page-line' as const;
  static override props: RecordProps<PageLineShape> = {
    w: T.number,
    h: T.number,
    lineId: T.string.nullable(),
    x1Norm: T.number,
    y1Norm: T.number,
    x2Norm: T.number,
    y2Norm: T.number,
    strokeWidth: T.number,
    strokeColor: T.string,
    strokeStyle: T.literalEnum(...PAGE_LINE_STROKE_STYLES),
  };

  override canResize() {
    return true;
  }
  override canEdit() {
    return false;
  }
  override canBind() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }

  getDefaultProps(): PageLineShape['props'] {
    return {
      w: 100,
      h: 1,
      lineId: null,
      x1Norm: 0,
      y1Norm: 0,
      x2Norm: 1,
      y2Norm: 1,
      // 스타일 기본값은 packages/types 가 단일 출처다. 여기서 다시 적으면
      // 공식 기본값을 바꿔도 새로 만드는 도형에는 반영되지 않는다.
      ...defaultPageLineStyle(),
    };
  }

  override component(shape: PageLineShape) {
    const { w, h, x1Norm, y1Norm, x2Norm, y2Norm, strokeWidth, strokeColor, strokeStyle } =
      shape.props;
    const x1 = x1Norm * w;
    const y1 = y1Norm * h;
    const x2 = x2Norm * w;
    const y2 = y2Norm * h;
    const sw = Math.max(0.5, strokeWidth);
    const dash = strokeStyle === 'dashed' ? `${sw * 3} ${sw * 3}` : undefined;
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: 'none' }}>
        <svg
          width={w}
          height={h}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={strokeColor}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={dash}
            style={{ pointerEvents: 'stroke' }}
          />
        </svg>
      </HTMLContainer>
    );
  }

  override indicator(shape: PageLineShape) {
    const { w, h, x1Norm, y1Norm, x2Norm, y2Norm } = shape.props;
    return <line x1={x1Norm * w} y1={y1Norm * h} x2={x2Norm * w} y2={y2Norm * h} strokeWidth={1} />;
  }
}
