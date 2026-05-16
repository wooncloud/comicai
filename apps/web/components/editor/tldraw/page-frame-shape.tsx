'use client';
import { BaseBoxShapeUtil, HTMLContainer, type RecordProps, T, type TLBaseShape } from 'tldraw';

export type PageFrameShape = TLBaseShape<
  'page-frame',
  {
    w: number;
    h: number;
    label: string;
  }
>;

export class PageFrameShapeUtil extends BaseBoxShapeUtil<PageFrameShape> {
  static override type = 'page-frame' as const;
  static override props: RecordProps<PageFrameShape> = {
    w: T.number,
    h: T.number,
    label: T.string,
  };

  override canResize() {
    return false;
  }
  override canEdit() {
    return false;
  }
  override hideResizeHandles() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }
  override hideSelectionBoundsFg() {
    return true;
  }
  override canBind() {
    return false;
  }
  override isAspectRatioLocked() {
    return true;
  }

  getDefaultProps(): PageFrameShape['props'] {
    return { w: 800, h: 1200, label: 'page' };
  }

  override component(shape: PageFrameShape) {
    const { w, h, label } = shape.props;
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          border: '1px dashed hsl(var(--border))',
          background: 'hsl(var(--background))',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          position: 'relative',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -22,
            left: 0,
            fontSize: 12,
            color: 'hsl(var(--muted-foreground))',
            fontWeight: 500,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {label} · {w}×{h}
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: PageFrameShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}
