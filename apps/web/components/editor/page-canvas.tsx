'use client';
import { useRef, useState } from 'react';
import type { PanelDTO, PanelShape } from '@comicai/types';
import { PanelStatusBadge } from './panel-status-badge';

interface Props {
  width: number;
  height: number;
  panels: PanelDTO[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (shape: PanelShape) => void;
}

export function PageCanvas({ width, height, panels, selectedId, onSelect, onCreate }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );

  function toLocal(e: React.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const sx = width / r.width;
    const sy = height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as Element).tagName === 'svg') {
      const p = toLocal(e);
      setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      onSelect(null);
    }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drawing) return;
    const p = toLocal(e);
    setDrawing({ ...drawing, x1: p.x, y1: p.y });
  }
  function onMouseUp() {
    if (!drawing) return;
    const x = Math.min(drawing.x0, drawing.x1);
    const y = Math.min(drawing.y0, drawing.y1);
    const w = Math.abs(drawing.x0 - drawing.x1);
    const h = Math.abs(drawing.y0 - drawing.y1);
    setDrawing(null);
    if (w < 24 || h < 24) return;
    const shape: PanelShape = {
      type: 'rect',
      points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      strokeColor: '#0f172a',
      strokeWidth: 2,
    };
    onCreate(shape);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="block h-[80vh] max-h-[1200px] w-auto rounded-md border border-border bg-card shadow-sm"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <defs>
        <pattern id="grid" width={50} height={50} patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#grid)" />

      {panels.map((p) => {
        const pts = p.shape.points.map((pt) => `${pt.x},${pt.y}`).join(' ');
        const isSelected = p.id === selectedId;
        const bbox = boundingBox(p.shape.points);
        return (
          <g key={p.id}>
            <polygon
              points={pts}
              fill="rgba(15,23,42,0.03)"
              stroke={isSelected ? '#2563eb' : p.shape.strokeColor}
              strokeWidth={isSelected ? 3 : p.shape.strokeWidth}
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(p.id);
              }}
            />
            {p.currentRenderStatus && (
              <foreignObject x={bbox.x + 8} y={bbox.y + 8} width={120} height={28}>
                <div className="pointer-events-none">
                  <PanelStatusBadge status={p.currentRenderStatus} />
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}

      {drawing && (
        <rect
          x={Math.min(drawing.x0, drawing.x1)}
          y={Math.min(drawing.y0, drawing.y1)}
          width={Math.abs(drawing.x0 - drawing.x1)}
          height={Math.abs(drawing.y0 - drawing.y1)}
          fill="rgba(37,99,235,0.08)"
          stroke="#2563eb"
          strokeDasharray="6 4"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

function boundingBox(points: { x: number; y: number }[]): { x: number; y: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys) };
}
