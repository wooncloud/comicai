'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /**
   * 손잡이를 끄는 **동안** 매번. 화면에 바로 비추는 용도다 — 여기서 저장하면 안 된다.
   * 주지 않으면 끄는 동안 캔버스는 그대로 있고 손을 뗄 때 한 번에 바뀐다.
   */
  onPreview?: (v: number) => void;
  /** 손을 뗐을 때(또는 숫자를 확정했을 때) 한 번. 저장은 여기서. */
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
 * 넣기를 반복하게 된다.
 *
 * **왜 숫자 칸도 남기나.** 슬라이더만 두면 "7 로 맞춰 둔 것과 똑같이" 가 안 된다.
 * 키보드로 값을 넣는 길이기도 하다.
 *
 * **끄는 동안 저장하지 않는다.** 처음에는 `onChange` 마다 커밋했는데, 컷 테두리는
 * 그게 곧 `PATCH /v1/panels/:id` 라서 손잡이를 한 번 끌면 요청이 수십 개 나갔다.
 * 마지막 응답이 먼저 온 응답을 덮는 경합도 생긴다. 그래서 끄는 동안은 화면만 바꾸고
 * (`onPreview`), 손을 뗄 때 한 번 저장한다(`onCommit`).
 *
 * 키보드(방향키)로 바꿀 때는 `keyup` 이 끝이다. 마우스는 `pointerup`, 그 밖의 경우는
 * `blur` 가 받는다 — 어느 경로로 바꾸든 커밋이 정확히 한 번 나가야 한다.
 */
export function StrokeWidthField({
  value,
  onPreview,
  onCommit,
  ariaLabel,
  min = 1,
  max = 10,
}: Props) {
  const clamped = Math.max(min, Math.min(max, value));
  /** 끄는 동안의 값. 놓으면 다시 `value` 를 따른다. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [draft, setDraft] = useState(String(clamped));
  const typing = useRef(false);

  const shown = dragging ?? clamped;

  useEffect(() => {
    if (!typing.current) setDraft(String(Math.max(min, Math.min(max, value))));
  }, [value, min, max]);

  function clamp(raw: number): number {
    return Math.max(min, Math.min(max, Math.round(raw) || min));
  }

  /** 끄는 동안. 화면만 바꾼다. */
  function preview(next: number) {
    setDragging(next);
    setDraft(String(next));
    if (next !== value) onPreview?.(next);
  }

  /** 손을 뗐다. 여기서만 저장한다. */
  function commit(next: number) {
    setDragging(null);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={shown}
        aria-label={ariaLabel}
        onChange={(e) => preview(clamp(Number(e.target.value)))}
        onPointerUp={() => commit(shown)}
        onKeyUp={() => commit(shown)}
        onBlur={() => commit(shown)}
        className="range-track h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
        style={{
          // 지나온 구간만 진하게. 배경 그라디언트라 JS 없이 따라온다.
          background: `linear-gradient(to right, hsl(var(--foreground)) ${
            ((shown - min) / (max - min)) * 100
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
          commit(clamp(Number(e.target.value)));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-14 shrink-0 rounded border border-border bg-card px-2 text-center text-body-sm tabular-nums"
      />
      <span className="shrink-0 text-caption text-muted-foreground">px</span>
    </div>
  );
}
