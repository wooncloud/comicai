'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { SessionUser } from '@comicai/types';

const NAV = [
  { href: '/projects', label: '프로젝트' },
  { href: '/settings', label: '설정' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<SessionUser | null>(null);

  useEffect(() => {
    api<SessionUser>('/auth/me').then(setMe).catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        if (typeof window !== 'undefined' && !path?.startsWith('/login') && !path?.startsWith('/signup')) {
          window.location.href = '/login';
        }
      }
    });
  }, [path]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-neutral-200 bg-white px-4 py-6 dark:border-neutral-800 dark:bg-neutral-950">
        <Link href="/" className="block text-lg font-semibold">
          ComicAI
        </Link>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 text-sm ${
                path?.startsWith(item.href)
                  ? 'bg-neutral-100 font-medium dark:bg-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {me && (
          <div className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
            로그인:&nbsp;
            <span className="font-mono">{me.id.slice(-8)}</span>
          </div>
        )}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
