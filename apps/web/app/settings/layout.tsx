'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { cn } from '@/lib/cn';
import { SETTINGS_NAV } from '@/lib/nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AppShell>
      <PageContainer>
        <h1 className="text-title-lg font-semibold sm:text-display-md">설정</h1>
        <nav className="mt-6 border-b border-border">
          <ul className="flex gap-1 overflow-x-auto">
            {SETTINGS_NAV.map((tab) => {
              const active = path === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      '-mb-px flex items-center whitespace-nowrap border-b-2 px-4 py-2 text-body-sm transition-colors touch:min-h-11',
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
      </PageContainer>
    </AppShell>
  );
}
