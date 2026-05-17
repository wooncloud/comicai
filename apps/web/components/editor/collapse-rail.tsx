'use client';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  /** 어느 쪽의 사이드인지 — 펼침 화살표 방향을 결정. */
  side: 'left' | 'right';
  onExpand: () => void;
  /** 세로로 표시될 짧은 라벨. */
  label?: string;
}

/**
 * 사이드 패널이 접혔을 때 보이는 얇은 레일. 클릭 시 펼친다.
 */
export function CollapseRail({ side, onExpand, label }: Props) {
  const Icon = side === 'left' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onExpand}
      title="펼치기"
      className={cn(
        'group flex w-8 flex-col items-center gap-3 border-border bg-card py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        side === 'left' ? 'border-r' : 'border-l',
      )}
    >
      <Icon className="h-4 w-4" />
      {label && (
        <span
          className="text-caption font-medium [writing-mode:vertical-rl]"
          style={{ transform: 'rotate(180deg)' }}
        >
          {label}
        </span>
      )}
    </button>
  );
}
