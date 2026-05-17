'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  side: 'left' | 'right';
  onClick: () => void;
  title: string;
}

/** 인스펙터/사이드바 헤더에서 접기 트리거. CollapseRail 의 역방향. */
export function CollapseButton({ side, onClick, title }: Props) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">{title}</span>
    </button>
  );
}
