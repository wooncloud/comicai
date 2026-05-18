'use client';
import { useEffect, useState } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
}

/**
 * blur 시점에 clamp + round 후 onCommit. value 와 다를 때만 호출.
 * 인스펙터 사이드패널 톤 (bg-card) 고정.
 */
export function NumberField({ value, min, max, step, onCommit, ariaLabel }: Props) {
  const [local, setLocal] = useState<string>(String(value));
  useEffect(() => setLocal(String(value)), [value]);

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = Math.max(min, Math.min(max, Math.round(Number(local) || 0)));
        setLocal(String(n));
        if (n !== value) onCommit(n);
      }}
      aria-label={ariaLabel}
      className="h-8 w-16 rounded border border-border bg-card px-2 text-body-sm"
    />
  );
}
