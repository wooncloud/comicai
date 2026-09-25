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
import { MAX_PAGE_DIMENSION, PAGE_SIZE_GROUPS } from '@comicai/types';

interface Props {
  value: { w: number; h: number };
  onChange: (size: { w: number; h: number }) => void;
  disabled?: boolean;
}

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
          {/*
            크기는 취향이 아니라 **어디에 올릴 것인가**가 정한다. 그래서 형식으로
            묶는다 — 예전에는 '세로 작게/기본/큼' 뿐이라 전부 출판 비율이었고,
            웹툰을 그리려던 사람이 왜 좌우가 남는지 알 수 없었다.
          */}
          <div className="space-y-3">
            {PAGE_SIZE_GROUPS.map((group) => (
              <div key={group.format} className="space-y-1.5">
                <div>
                  <div className="text-body-sm font-medium">{group.format}</div>
                  <div className="text-caption text-muted-foreground">{group.hint}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {group.presets.map((p) => {
                    const active = p.w === value.w && p.h === value.h;
                    return (
                      <button
                        key={`${p.w}x${p.h}`}
                        onClick={() => applyPreset(p)}
                        className={cn(
                          'flex flex-col items-start rounded border px-3 py-2 text-left transition-colors',
                          active
                            ? 'border-foreground bg-muted'
                            : 'border-border hover:border-foreground/40 hover:bg-muted/50',
                        )}
                      >
                        <span className="text-body-sm font-medium">{p.label}</span>
                        <span className="text-caption tabular-nums text-muted-foreground">
                          {p.w}×{p.h}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
