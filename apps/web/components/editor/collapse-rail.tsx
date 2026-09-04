'use client';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  /** 어느 쪽의 사이드인지 — 펼침 화살표 방향을 결정. */
  side: 'left' | 'right';
  onExpand: () => void;
}

/**
 * 사이드 패널이 접혔을 때 보이는 얇은 레일. 클릭 시 펼친다.
 *
 * 예전에는 세로 라벨(`label`)을 받았는데 넘기는 호출부가 하나도 없었다.
 */
export function CollapseRail({ side, onExpand }: Props) {
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
    </button>
  );
}
