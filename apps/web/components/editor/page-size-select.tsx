'use client';
import { useEffect, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_DIMENSION } from '@comicai/types';

interface Props {
  value: { w: number; h: number };
  onChange: (size: { w: number; h: number }) => void;
  disabled?: boolean;
}

/**
 * 자주 쓰는 크기.
 *
 * 한 단계씩 올렸다 — 예전 기본값 800×1200 은 내보낸 PNG 가 작아서 인쇄하거나
 * 확대하면 테두리와 대사가 흐렸다. 세로는 2:3(`DEFAULT_PAGE_SIZE` 와 같은 비율)로
 * 맞춘다. 페이지 크기는 캔버스와 내보내기 해상도만 정하고 그림 생성 비용과는 무관하다.
 */
const PRESETS: { label: string; w: number; h: number }[] = [
  { label: '세로 작게', w: 800, h: 1200 },
  { label: '세로 기본', w: DEFAULT_PAGE_SIZE.w, h: DEFAULT_PAGE_SIZE.h },
  { label: '세로 큼', w: 1400, h: 2100 },
  { label: '가로 기본', w: 1536, h: 1024 },
  { label: '정사각', w: 1200, h: 1200 },
];

const MIN = 200;
// 서버의 상한과 같은 값을 쓴다 — 화면이 더 관대하면 저장할 때만 튕긴다.
const MAX = MAX_PAGE_DIMENSION;

export function PageSizeSelect({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(String(value.w));
  const [h, setH] = useState(String(value.h));

  useEffect(() => {
    if (open) {
      setW(String(value.w));
      setH(String(value.h));
    }
  }, [open, value.w, value.h]);

  function applyPreset(p: { w: number; h: number }) {
    if (p.w === value.w && p.h === value.h) {
      setOpen(false);
      return;
    }
    onChange({ w: p.w, h: p.h });
    setOpen(false);
  }

  function applyCustom() {
    const nw = Math.round(Number(w));
    const nh = Math.round(Number(h));
    if (!Number.isFinite(nw) || !Number.isFinite(nh)) return;
    if (nw < MIN || nh < MIN || nw > MAX || nh > MAX) return;
    if (nw === value.w && nh === value.h) {
      setOpen(false);
      return;
    }
    onChange({ w: nw, h: nh });
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        {value.w}×{value.h}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>페이지 크기</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-caption text-muted-foreground">자주 쓰는 크기</div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => {
                const active = p.w === value.w && p.h === value.h;
                return (
                  <button
                    key={`${p.w}x${p.h}`}
                    onClick={() => applyPreset(p)}
                    className={cn(
                      'flex items-baseline justify-between rounded border px-3 py-2 text-left text-body-sm transition-colors',
                      active
                        ? 'border-foreground bg-muted'
                        : 'border-border hover:border-foreground/40 hover:bg-muted/50',
                    )}
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="text-caption text-muted-foreground">
                      {p.w}×{p.h}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-caption text-muted-foreground">직접 입력</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyCustom();
              }}
              className="flex items-center gap-2"
            >
              <Input
                type="number"
                min={MIN}
                max={MAX}
                value={w}
                onChange={(e) => setW(e.target.value)}
                aria-label="가로"
                className="w-24"
              />
              <span className="text-muted-foreground">×</span>
              <Input
                type="number"
                min={MIN}
                max={MAX}
                value={h}
                onChange={(e) => setH(e.target.value)}
                aria-label="세로"
                className="w-24"
              />
              <span className="text-caption text-muted-foreground">px</span>
              <Button type="submit" size="sm" className="ml-auto">
                적용
              </Button>
            </form>
            <div className="text-caption text-muted-foreground">
              {MIN}–{MAX}px 사이.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
