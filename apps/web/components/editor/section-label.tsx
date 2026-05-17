'use client';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  children: React.ReactNode;
  /** 라벨이 form 컨트롤과 묶일 때 사용. 부재 시 div로 렌더. */
  htmlFor?: string;
}

/**
 * 인스펙터 섹션 헤더. lucide 아이콘 + bold 라벨.
 * caption(12px)보다 2px 큰 body-sm(14px) + semibold + foreground 컬러로
 * 시각적으로 섹션 경계가 분명히 구분된다.
 */
export function SectionLabel({ icon: Icon, children, htmlFor }: Props) {
  const cls = 'flex items-center gap-1.5 text-body-sm font-semibold text-foreground';
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </label>
  ) : (
    <div className={cls}>
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </div>
  );
}
