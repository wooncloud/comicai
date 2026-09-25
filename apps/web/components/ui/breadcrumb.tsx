import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-body-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-2">
            {c.href && !last ? (
              <Link
                href={c.href}
                className="tap-link truncate text-muted-foreground hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span className={cn('truncate', last ? 'font-medium' : 'text-muted-foreground')}>
                {c.label}
              </span>
            )}
            {/*
              슬래시가 아니라 꺾쇠다. 슬래시는 날짜·분수·경로에도 쓰여 "다음 단계" 라는
              뜻이 약하고, 작품 이름에 슬래시가 들어가면 어디가 구분자인지 흐려진다.
            */}
            {!last && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
          </span>
        );
      })}
    </nav>
  );
}
