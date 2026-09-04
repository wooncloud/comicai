'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { cn } from '@/lib/cn';
import { SETTINGS_NAV } from '@/lib/nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-display-md font-semibold">설정</h1>
        <nav className="mt-6 border-b border-border">
          <ul className="flex gap-1 overflow-x-auto">
            {SETTINGS_NAV.map((tab) => {
              const active = path === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      'flex items-center whitespace-nowrap border-b-2 px-4 py-2 text-body-sm transition-colors touch:min-h-11',
                      active
                        ? 'border-foreground font-medium text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-8">{children}</div>
      </div>
    </AppShell>
  );
}
