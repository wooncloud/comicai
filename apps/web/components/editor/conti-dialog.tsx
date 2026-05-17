'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, Pencil, Eraser, RotateCcw, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Mode = 'upload' | 'draw';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 파일을 받아 업로드 처리. 호출자가 PATCH/POST를 책임. */
  onSubmit: (file: File) => Promise<void>;
  /** 캔버스 크기 — 패널 비율을 따른다. 기본 1024×1024. */
  width?: number;
  height?: number;
}

const STROKE_COLORS = ['#000000', '#dc2626', '#2563eb', '#16a34a'] as const;
const STROKE_WIDTHS = [2, 4, 8, 16] as const;

export function ContiDialog({ open, onClose, onSubmit, width = 1024, height = 1024 }: Props) {
  const [mode, setMode] = useState<Mode>('draw');
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>콘티 추가</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border">
          <TabButton active={mode === 'draw'} onClick={() => setMode('draw')}>
            <Pencil className="h-3.5 w-3.5" />
            그리기
          </TabButton>
          <TabButton active={mode === 'upload'} onClick={() => setMode('upload')}>
            <Upload className="h-3.5 w-3.5" />
            이미지 첨부
          </TabButton>
        </div>

        {mode === 'draw' ? (
          <DrawPane
            width={width}
            height={height}
            submitting={submitting}
            onSubmit={async (file) => {
              setSubmitting(true);
              try {
                await onSubmit(file);
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
            onCancel={onClose}
          />
        ) : (
          <UploadPane
            submitting={submitting}
            onSubmit={async (file) => {
              setSubmitting(true);
              try {
                await onSubmit(file);
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-body-sm transition-colors',
        active
          ? 'border-foreground font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function UploadPane({
  submitting,
  onSubmit,
  onCancel,
}: {
  submitting: boolean;
  onSubmit: (file: File) => Promise<void>;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  return (
    <div className="space-y-3">
      <label className="flex h-64 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-body-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground">
        {previewUrl ? (
          <img src={previewUrl} alt="preview" className="max-h-full max-w-full object-contain" />
        ) : (
          <span>이미지 파일을 선택하세요 (PNG/JPEG/WEBP)</span>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button disabled={!file || submitting} onClick={() => file && void onSubmit(file)}>
          {submitting ? '업로드 중…' : '첨부'}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface Stroke {
  color: string;
  width: number;
  points: { x: number; y: number }[];
  /** true면 지우개 — destination-out으로 합성. */
  erase?: boolean;
}

function DrawPane({
  width,
  height,
  submitting,
  onSubmit,
  onCancel,
}: {
  width: number;
  height: number;
  submitting: boolean;
  onSubmit: (file: File) => Promise<void>;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(STROKE_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTHS[1]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [drawing, setDrawing] = useState(false);

  // 캔버스에 strokes 재렌더 — undo 시 전체 다시 그림.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const s of strokes) {
      if (s.points.length === 0) continue;
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i]!;
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [strokes]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * c.width;
    const y = ((e.clientY - rect.top) / rect.height) * c.height;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    const p = pointFromEvent(e);
    setStrokes((prev) => [
      ...prev,
      { color, width: strokeWidth, points: [p], erase: tool === 'eraser' },
    ]);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const p = pointFromEvent(e);
    setStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      const next = prev.slice(0, -1);
      next.push({ ...last, points: [...last.points, p] });
      return next;
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrawing(false);
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  function clear() {
    setStrokes([]);
  }

  async function attach() {
    const c = canvasRef.current;
    if (!c) return;
    const blob: Blob = await new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob 변환 실패'))), 'image/png', 0.92),
    );
    const file = new File([blob], `conti-${Date.now()}.png`, { type: 'image/png' });
    await onSubmit(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
        <ToolToggle
          active={tool === 'pen'}
          onClick={() => setTool('pen')}
          label="펜"
          icon={<Pencil className="h-3.5 w-3.5" />}
        />
        <ToolToggle
          active={tool === 'eraser'}
          onClick={() => setTool('eraser')}
          label="지우개"
          icon={<Eraser className="h-3.5 w-3.5" />}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setTool('pen');
              }}
              className={cn(
                'h-5 w-5 rounded-full border transition',
                color === c && tool === 'pen'
                  ? 'border-foreground ring-2 ring-foreground/30'
                  : 'border-border',
              )}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setStrokeWidth(w)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-caption transition-colors',
                strokeWidth === w
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              title={`두께 ${w}`}
            >
              <span className="rounded-full bg-current" style={{ width: w, height: w }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="sm" onClick={undo} disabled={strokes.length === 0}>
          <RotateCcw className="h-3.5 w-3.5" />
          되돌리기
        </Button>
        <Button variant="ghost" size="sm" onClick={clear} disabled={strokes.length === 0}>
          <Trash2 className="h-3.5 w-3.5" />
          전체 지우기
        </Button>
      </div>

      <div className="flex items-center justify-center rounded-md border border-border bg-neutral-50 p-2 dark:bg-neutral-900">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            maxHeight: '50vh',
            aspectRatio: `${width}/${height}`,
            width: 'auto',
            maxWidth: '100%',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            touchAction: 'none',
          }}
          className="rounded-sm border border-border bg-white shadow-sm"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button onClick={() => void attach()} disabled={submitting || strokes.length === 0}>
          {submitting ? '업로드 중…' : '첨부'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ToolToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-sm transition-colors',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
