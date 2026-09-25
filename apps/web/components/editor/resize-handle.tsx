'use client';
import { cn } from '@/lib/cn';
import { useResizeDrag, type PanelWidthSpec } from '@/lib/use-panel-width';

interface Props {
  /** 손잡이가 어느 쪽 패널의 경계인가. 끄는 방향이 반대가 된다. */
  side: 'left' | 'right';
  label: string;
  width: number;
  spec: PanelWidthSpec;
  onResize: (w: number) => void;
}

/**
 * 패널 경계의 끌기 손잡이.
 *
 * 폭은 5px 지만 hover 영역을 좌우로 넓히지 않는다 — 캔버스 가장자리를 클릭하려다
 * 손잡이를 잡는 일이 생긴다. 대신 커서와 색으로 잡을 수 있다는 것을 알린다.
 *
 * 접혀 있을 때도 같은 손잡이가 남는다. 그게 **다시 꺼내는 유일한 길**이라 눈에
 * 띄어야 해서, 그때는 가운데에 작은 손잡이 표시를 띄운다.
 *
 * 키보드로도 조절된다(`separator` 역할 + 방향키). 마우스만 되는 조절 손잡이는
 * 키보드 사용자에게는 없는 기능이다.
 */
export function ResizeHandle({ side, label, width, spec, onResize }: Props) {
  const { dragging, handlers } = useResizeDrag(side, width, spec.defaultWidth, onResize);
  const hidden = width === 0;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={spec.max}
      tabIndex={0}
      {...handlers}
      onDoubleClick={() => onResize(hidden ? spec.defaultWidth : 0)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 8;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onResize((width || spec.defaultWidth) + (side === 'left' ? -step : step));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onResize((width || spec.defaultWidth) + (side === 'left' ? step : -step));
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onResize(hidden ? spec.defaultWidth : 0);
        }
      }}
      className={cn(
        'group relative w-[5px] shrink-0 cursor-col-resize touch-none select-none border-border bg-card outline-none transition-colors',
        side === 'left' ? 'border-r' : 'border-l',
        dragging ? 'bg-foreground/20' : 'hover:bg-foreground/10 focus-visible:bg-foreground/10',
      )}
    >
      {/* 접혔을 때만 — 여기가 다시 꺼내는 자리라는 표시. */}
      {hidden && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-foreground/60"
        />
      )}
    </div>
  );
}
