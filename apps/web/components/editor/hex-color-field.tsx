'use client';
import { useEffect, useState } from 'react';
import { isHexColor } from '@comicai/types';

interface Props {
  value: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
  variant?: 'page' | 'panel';
}

/**
 * color picker + hex 텍스트 필드. blur 시점에만 onCommit.
 * 잘못된 hex 입력은 직전 value 로 되돌린다.
 */
export function HexColorField({ value, onCommit, ariaLabel, variant = 'page' }: Props) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const bg = variant === 'panel' ? 'bg-card' : 'bg-background';
  return (
    <>
      <input
        type="color"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        aria-label={ariaLabel}
        className={`h-8 w-10 cursor-pointer rounded border border-border ${bg} p-0.5`}
      />
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (isHexColor(v)) onCommit(v);
          else setLocal(value);
        }}
        className={`h-8 flex-1 rounded border border-border ${bg} px-2 font-mono text-caption`}
        aria-label={`${ariaLabel} (hex)`}
      />
    </>
  );
}
