'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/settings/profile', label: '프로필' },
  { href: '/settings/api-keys', label: 'API 키' },
  { href: '/settings/security', label: '계정 및 보안' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-display-md font-semibold">설정</h1>
        <nav className="mt-6 border-b border-border">
          <ul className="flex gap-1">
            {TABS.map((tab) => {
              const active = path?.startsWith(tab.href);
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={cn(
                      'inline-block border-b-2 px-4 py-2 text-body-sm transition-colors',
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
