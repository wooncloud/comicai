'use client';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  children: React.ReactNode;
}

/**
 * 인스펙터 섹션 헤더. lucide 아이콘 + bold 라벨.
 * caption(12px)보다 2px 큰 body-sm(14px) + semibold + foreground 컬러로
 * 시각적으로 섹션 경계가 분명히 구분된다.
 *
 * 예전에는 `htmlFor` 를 받아 `label`/`div` 를 갈랐는데, 호출부 9곳 중 그걸 넘기는
 * 곳이 하나도 없었다. 라벨이 form 컨트롤과 묶여야 하면 그때 되살리면 된다.
 */
export function SectionLabel({ icon: Icon, children }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-body-sm font-semibold text-foreground">
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </div>
  );
}
