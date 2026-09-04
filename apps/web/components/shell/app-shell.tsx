'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { MobileNav } from '@/components/shell/mobile-nav';
import { cn } from '@/lib/cn';
import { ADMIN_NAV, PRIMARY_NAV, useLogout } from '@/lib/nav';
import { qk } from '@/lib/query-keys';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Topbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function Topbar() {
  const path = usePathname();
  const logout = useLogout();
  const { data: me, error } = useQuery<SessionUser>({
    queryKey: qk.me(),
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

  const initials = (me?.displayName ?? me?.email ?? '··').slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:gap-6 sm:px-6">
      {/* 로그인한 사용자에게만. 랜딩도 이 Topbar 를 쓰는데 비로그인은 드로어에 넣을 게 없다. */}
      {me && <MobileNav me={me} />}

      <Link
        href={me ? '/dashboard' : '/'}
        className="flex shrink-0 items-center gap-2 text-title-md font-semibold touch:min-h-11"
      >
        <Image src="/brush.svg" alt="" width={26} height={26} priority />
        ComicAI
      </Link>

      {/*
        좁은 화면에서는 드로어가 대신하므로 감춘다. `flex-1` 을 nav 가 아니라 여기
        바깥에 둔 이유: nav 를 `hidden` 으로 감추는 순간 스페이서까지 같이 사라져
        아바타가 로고 옆으로 달라붙는다.
      */}
      <nav className="hidden items-center gap-1 text-body-sm md:flex">
        {me &&
          PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center whitespace-nowrap rounded px-3 py-1.5 transition-colors touch:min-h-11',
                item.match(path ?? '')
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
      </nav>
      <span className="flex-1" />
      {/* 좁은 화면에서는 드로어가 같은 항목을 담고 있어 감춘다. */}
      {me ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="계정 메뉴"
              className="hidden shrink-0 items-center justify-center rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:flex touch:h-11 touch:w-11"
            >
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
            {/*
              "계정 및 보안" 은 넣지 않는다 — /settings 안의 탭이라 여기 두면
              같은 목적지가 두 번 나타난다. 설정 하나로 들어가면 거기서 갈라진다.
            */}
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">설정</Link>
            </DropdownMenuItem>
            {me.isAdmin && (
              <DropdownMenuItem asChild>
                <Link href={ADMIN_NAV.href}>{ADMIN_NAV.label}</Link>
              </DropdownMenuItem>
            )}
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
