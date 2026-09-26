'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { MAX_PAGE_DIMENSION, PAGE_SIZE_GROUPS } from '@comicai/types';

interface Props {
  value: { w: number; h: number };
  onChange: (size: { w: number; h: number }) => void;
}

const MIN = 200;
// 서버의 상한과 같은 값을 쓴다 — 화면이 더 관대하면 저장할 때만 튕긴다.
const MAX = MAX_PAGE_DIMENSION;

/**
 * 페이지 크기 — 형식별 프리셋과 직접 입력을 인스펙터에 **펼쳐 둔다.**
 *
 * 예전에는 현재 크기가 적힌 버튼 하나였고, 눌러야 프리셋 창이 떴다. 지금 크기가 어느
 * 형식인지 보이지 않았고, 크기 하나 바꾸는 데 창을 열고 고르고 닫는 세 번이 들었다.
 * 페이지 인스펙터에는 크기·배경·내보내기뿐이라 자리가 넉넉하다.
 *
 * 크기는 취향이 아니라 **어디에 올릴 것인가**가 정한다. 그래서 형식으로 묶는다 —
 * 예전에는 '세로 작게/기본/큼' 뿐이라 전부 출판 비율이었고, 웹툰을 그리려던 사람이
 * 왜 좌우가 남는지 알 수 없었다.
 */
export function PageSizeSelect({ value, onChange }: Props) {
  const [w, setW] = useState(String(value.w));
  const [h, setH] = useState(String(value.h));

  // 프리셋을 누르거나 다른 페이지로 옮기면 입력칸도 따라간다.
  useEffect(() => {
    setW(String(value.w));
    setH(String(value.h));
  }, [value.w, value.h]);

  const nw = Math.round(Number(w));
  const nh = Math.round(Number(h));
  const inRange = (n: number) => Number.isFinite(n) && n >= MIN && n <= MAX;
  const valid = inRange(nw) && inRange(nh);
  const changed = nw !== value.w || nh !== value.h;

  /** 같은 크기면 요청하지 않는다. */
  function apply(next: { w: number; h: number }) {
    if (next.w !== value.w || next.h !== value.h) onChange(next);
  }

  return (
    <div className="space-y-3">
      {PAGE_SIZE_GROUPS.map((group) => (
        <div key={group.format} className="space-y-1.5">
          <div>
            <div className="text-caption font-medium text-foreground">{group.format}</div>
            <div className="text-caption text-muted-foreground">{group.hint}</div>
          </div>
          {/*
            칸마다 최소 폭을 둔다. 인스펙터를 좁히면 세 칸이 두 칸으로 넘어간다 —
            세 칸을 고집하면 "800×1…" 처럼 정작 크기가 잘린다.
          */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1.5">
            {group.presets.map((p) => {
              const active = p.w === value.w && p.h === value.h;
              return (
                <button
                  key={`${p.w}x${p.h}`}
                  type="button"
                  // 프리셋에는 이름(label)도 있다. 크기만 보낸다.
                  onClick={() => apply({ w: p.w, h: p.h })}
                  aria-pressed={active}
                  className={cn(
                    'flex min-w-0 flex-col items-start rounded border px-2 py-1.5 text-left transition-colors',
                    active
                      ? 'border-foreground bg-muted'
                      : 'border-border hover:border-foreground/40 hover:bg-muted/50',
                  )}
                >
                  <span className="w-full truncate text-caption font-medium">{p.label}</span>
                  <span className="w-full truncate text-caption tabular-nums text-muted-foreground">
                    {p.w}×{p.h}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) apply({ w: nw, h: nh });
        }}
        className="space-y-1.5"
      >
        <div className="text-caption font-medium text-foreground">직접 입력</div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={w}
            onChange={(e) => setW(e.target.value)}
            aria-label="가로"
            className="h-8 min-w-0 flex-1 bg-card px-2 tabular-nums"
          />
          <span className="text-caption text-muted-foreground">×</span>
          <Input
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={h}
            onChange={(e) => setH(e.target.value)}
            aria-label="세로"
            className="h-8 min-w-0 flex-1 bg-card px-2 tabular-nums"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!valid || !changed}>
            적용
          </Button>
        </div>
        <div className={cn('text-caption', valid ? 'text-muted-foreground' : 'text-destructive')}>
          {MIN}–{MAX}px 사이.
        </div>
      </form>
    </div>
  );
}
