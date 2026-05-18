'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type SessionUser } from '@comicai/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/settings', label: '설정' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function Topbar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, error } = useQuery<SessionUser>({
    queryKey: ['me'],
    queryFn: () => api<SessionUser>(ApiPaths.me),
    retry: false,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/signup') &&
        window.location.pathname !== '/'
      ) {
        window.location.href = '/login';
      }
    }
  }, [error]);

  async function logout() {
    try {
      await api(ApiPaths.logout, { method: 'POST' });
    } finally {
      queryClient.setQueryData(['me'], null);
      router.push('/');
    }
  }

  const initials = (me?.displayName ?? me?.email ?? '··').slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-6 border-b border-border bg-background/95 px-6 backdrop-blur">
      <Link
        href={me ? '/dashboard' : '/'}
        className="flex items-center gap-2 text-title-md font-semibold"
      >
        <Image src="/brush.svg" alt="" width={26} height={26} priority />
        ComicAI
      </Link>
      <nav className="flex flex-1 items-center gap-1 text-body-sm">
        {me &&
          NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded px-3 py-1.5 transition-colors',
                path?.startsWith(item.href)
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        {!me && <span className="flex-1" />}
      </nav>
      {rightSlot}
      {me ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Avatar className="h-8 w-8">
                {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="truncate text-body-sm font-medium">{me.displayName ?? '익명'}</div>
              <div className="truncate text-caption font-normal text-muted-foreground">
                {me.email}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">설정</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/security">계정 및 보안</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>로그아웃</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex items-center gap-2 text-body-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">
              <LogIn className="h-4 w-4 shrink-0" />
              로그인
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">
              <UserPlus className="h-4 w-4 shrink-0" />
              가입
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
}
