'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type SessionUser } from '@comicai/types';

const NAV = [
  { href: '/projects', label: '프로젝트' },
  { href: '/settings', label: '설정' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<SessionUser | null>(null);

  useEffect(() => {
    api<SessionUser>(ApiPaths.me)
      .then(setMe)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          if (
            typeof window !== 'undefined' &&
            !window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/signup')
          ) {
            window.location.href = '/login';
          }
        }
      });
  }, []);

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
          <div
            className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800"
            title={me.email}
          >
            <div className="truncate">{me.email}</div>
          </div>
        )}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
