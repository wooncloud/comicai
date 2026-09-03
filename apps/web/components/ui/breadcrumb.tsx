import Link from 'next/link';
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
            {!last && <span className="shrink-0 text-muted-foreground/60">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
