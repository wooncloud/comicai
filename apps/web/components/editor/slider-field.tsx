'use client';
import { clamp } from '@/lib/math';
import { NumberField } from './number-field';

interface Props {
  value: number;
  /** 손잡이를 끄는 동안에도 매번 부른다 — 아래 "끄는 동안" 참고. */
  onChange: (v: number) => void;
  ariaLabel: string;
  min: number;
  max: number;
  unit?: string;
}

/**
 * 슬라이더와 숫자 칸을 한 줄에 — 선 굵기와 글자 크기가 같이 쓴다.
 *
 * **왜 슬라이더인가.** 굵기·크기는 "얼마나" 가 눈으로 보여야 정해진다. 숫자 칸만 있으면
 * 3 과 6 의 차이를 머릿속으로 그려야 하고, 결국 값을 넣고 캔버스를 보고 다시 넣기를
 * 반복하게 된다.
 *
 * **왜 숫자 칸도 남기나.** 슬라이더만 두면 "7 로 맞춰 둔 것과 똑같이" 가 안 된다.
 * 키보드로 값을 넣는 길이기도 하다.
 *
 * **끄는 동안.** 받는 쪽이 모두 캔버스 셰이프(`editor.updateShape`)라 매번 불러도
 * 화면만 바뀌고, 저장은 sync 훅이 손을 뗀 뒤 한 번 한다. 예전에는 컷 테두리만 곧장
 * `PATCH` 였어서 손잡이를 한 번 끌면 요청이 수십 개 나갔고, 그걸 막으려고 이 필드가
 * "끄는 중" 과 "놓음" 을 따로 알려야 했다. 컷도 캔버스를 거치게 되며 그 구분이 사라졌다.
 * 곧장 요청을 보내는 곳에 이 필드를 쓰려면 그 구분을 다시 들여와야 한다.
 */
export function SliderField({ value, onChange, ariaLabel, min, max, unit = 'px' }: Props) {
  const shown = clamp(value, min, max);
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={shown}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (n !== value) onChange(n);
        }}
        className="range-track h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
        style={{
          // 지나온 구간만 진하게. 배경 그라디언트라 JS 없이 따라온다.
          background: `linear-gradient(to right, hsl(var(--foreground)) ${
            ((shown - min) / (max - min)) * 100
          }%, hsl(var(--border)) 0%)`,
        }}
      />
      <NumberField
        value={shown}
        min={min}
        max={max}
        step={1}
        onCommit={onChange}
        ariaLabel={`${ariaLabel} (숫자)`}
      />
      <span className="shrink-0 text-caption text-muted-foreground">{unit}</span>
    </div>
  );
}

/** 선 굵기의 범위. 컷 테두리·말풍선 선·직선이 같은 범위를 쓴다. */
export const STROKE_WIDTH_RANGE = { min: 1, max: 10 } as const;
