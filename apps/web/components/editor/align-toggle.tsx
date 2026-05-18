'use client';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { TextAlign } from '@comicai/types';

interface Props {
  value: TextAlign;
  onChange: (v: TextAlign) => void;
}

export function AlignToggle({ value, onChange }: Props) {
  const items: { v: TextAlign; Icon: typeof AlignLeft; label: string }[] = [
    { v: 'left', Icon: AlignLeft, label: '왼쪽 정렬' },
    { v: 'center', Icon: AlignCenter, label: '가운데 정렬' },
    { v: 'right', Icon: AlignRight, label: '오른쪽 정렬' },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded border border-border">
      {items.map(({ v, Icon, label }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (!active) onChange(v);
            }}
            aria-label={label}
            aria-pressed={active}
            className={`flex h-8 w-8 items-center justify-center transition-colors ${
              active
                ? 'bg-foreground text-background'
                : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
