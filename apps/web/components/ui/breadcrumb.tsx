import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-2">
            {c.href && !last ? (
              <Link
                href={c.href}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              >
                {c.label}
              </Link>
            ) : (
              <span className={last ? 'font-medium' : 'text-neutral-500'}>{c.label}</span>
            )}
            {!last && <span className="text-neutral-400">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
