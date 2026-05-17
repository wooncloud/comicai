'use client';
import { useEditor, useValue } from 'tldraw';
import { polygonHoverAtom, polygonPointsAtom, type Point } from './polygon-state';

/**
 * polygon 도구 활성 시 캔버스 위에 현재 누적 vertex들 + 마우스까지의 preview 라인을 그림.
 * tldraw `components.InFrontOfTheCanvas`로 마운트되어 화면 픽셀 공간에 렌더.
 * 좌표는 `pageToViewport` 로 — tldraw 컨테이너 기준이므로 사이드바/헤더가 있어도 SVG inset:0 와 일치.
 * (`pageToScreen` 은 window 기준이라 screenBounds offset 만큼 어긋난다.)
 * 카메라(zoom/pan) 변화에 useValue가 자동 리렌더 트리거.
 */
export function PolygonPreview(): JSX.Element | null {
  const editor = useEditor();
  const toolId = useValue('current-tool', () => editor.getCurrentToolId(), [editor]);
  const points = useValue('polygon-points', () => polygonPointsAtom.get(), []);
  const hover = useValue('polygon-hover', () => polygonHoverAtom.get(), []);
  // camera는 직접 쓰지 않아도 변화에 반응해 위치를 재계산하기 위해 구독.
  useValue('camera', () => editor.getCamera(), [editor]);

  const isPolygonTool = toolId === 'polygon-panel' || toolId === 'bubble-polygon';
  if (!isPolygonTool || points.length === 0) return null;

  const scr = points.map((p) => editor.pageToViewport(p));
  const first = scr[0];
  const last = scr[scr.length - 1];
  if (!first || !last) return null;
  const tail = hover ? editor.pageToViewport(hover) : null;
  const showCloseHint = !!(points.length >= 3 && tail && screenDist(first, tail) <= 12);
  const polyline = scr.map((p) => `${p.x},${p.y}`).join(' ');
  const closingTail = showCloseHint ? first : tail;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="rgb(59 130 246)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {closingTail && (
        <line
          x1={last.x}
          y1={last.y}
          x2={closingTail.x}
          y2={closingTail.y}
          stroke={showCloseHint ? 'rgb(34 197 94)' : 'rgb(59 130 246)'}
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
      {scr.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 && showCloseHint ? 7 : 4}
          fill={i === 0 && showCloseHint ? 'rgb(34 197 94)' : 'rgb(59 130 246)'}
          stroke="white"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

function screenDist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
