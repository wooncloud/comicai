import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-2">
            {c.href && !last ? (
              <Link
                href={c.href}
                className="-my-2 inline-flex min-h-11 items-center truncate text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              >
                {c.label}
              </Link>
            ) : (
              <span className={cn('truncate', last ? 'font-medium' : 'text-neutral-500')}>
                {c.label}
              </span>
            )}
            {!last && <span className="shrink-0 text-neutral-400">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
