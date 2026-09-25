'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  value: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
  min?: number;
  max?: number;
}

/**
 * 선 굵기 — 슬라이더와 숫자 칸을 한 줄에.
 *
 * **왜 슬라이더인가.** 굵기는 "얼마나 굵은가" 가 눈으로 보여야 정해진다. 숫자 칸만
 * 있으면 3 과 6 의 차이를 머릿속으로 그려야 하고, 결국 값을 넣고 캔버스를 보고 다시
 * 넣기를 반복하게 된다. 슬라이더는 끄는 동안 캔버스가 따라 바뀌어 그 왕복이 없다.
 *
 * **숫자 칸도 남긴다.** 슬라이더만 두면 "7 로 맞춰 둔 것과 똑같이" 가 안 된다 —
 * 같은 값을 다른 도형에 다시 주려면 정확히 집을 수 있어야 한다. 키보드로 값을
 * 넣는 길이기도 하다.
 *
 * 끄는 동안(`onChange`)에도 바로 반영한다. 손을 뗄 때만 반영하면 미리보기가 없어
 * 슬라이더를 쓰는 이유가 사라진다. 저장은 호출부가 디바운스한다.
 */
export function StrokeWidthField({ value, onCommit, ariaLabel, min = 1, max = 10 }: Props) {
  const [draft, setDraft] = useState(String(value));
  // 슬라이더를 끄는 동안 올라온 값이 되돌아와 숫자 칸을 덮어쓰지 않게 한다.
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setDraft(String(value));
  }, [value]);

  function commit(raw: number) {
    const n = Math.max(min, Math.min(max, Math.round(raw)));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.max(min, Math.min(max, value))}
        aria-label={ariaLabel}
        onChange={(e) => commit(Number(e.target.value))}
        className="range-track h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
        style={{
          // 지나온 구간만 진하게. 배경 그라디언트라 JS 없이 따라온다.
          background: `linear-gradient(to right, hsl(var(--foreground)) ${
            ((Math.max(min, Math.min(max, value)) - min) / (max - min)) * 100
          }%, hsl(var(--border)) 0%)`,
        }}
      />
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-label={`${ariaLabel} (숫자)`}
        onFocus={() => (typing.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          typing.current = false;
          commit(Number(e.target.value) || min);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          'h-8 w-14 shrink-0 rounded border border-border bg-card px-2 text-center text-body-sm tabular-nums',
        )}
      />
      <span className="shrink-0 text-caption text-muted-foreground">px</span>
    </div>
  );
}
