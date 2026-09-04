'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogIn, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
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
import { FooterLinks } from '@/components/shell/footer-links';
import { MobileNav } from '@/components/shell/mobile-nav';
import { cn } from '@/lib/cn';
import { ADMIN_NAV, PRIMARY_NAV, useLogout } from '@/lib/nav';
import { qk } from '@/lib/query-keys';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Topbar authed />
      <main className="flex-1">{children}</main>
      {/*
        약관·개인정보 처리방침은 로그인한 뒤에도 닿아야 한다. 랜딩 푸터에만
        두면 이미 가입한 사람은 다시 볼 방법이 없다 — 실제로 그런 상태였다.

        에디터는 AppShell 을 쓰지 않는다(전체 화면). 문서 흐름 화면에만 붙는다.
      */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-end px-6 py-2 text-caption text-muted-foreground">
          <FooterLinks />
        </div>
      </footer>
    </div>
  );
}

/**
 * @param authed 로그인한 사용자만 오는 화면인가.
 *   AppShell 을 거치는 화면은 전부 true 다. 랜딩(app/page.tsx)만 Topbar 를 직접
 *   쓰면서 false 로 둔다 — 비로그인 방문자에게 빈 자리를 예약해 둘 이유가 없다.
 */
export function Topbar({ authed = false }: { authed?: boolean }) {
  const path = usePathname();
  const logout = useLogout();
  const { data: me } = useQuery<SessionUser>({
    queryKey: qk.me(),
    queryFn: () => api<SessionUser>(ApiPaths.me),
    retry: false,
    /*
     * 이 조회는 오류 경계로 던지지 않는다.
     *
     * Topbar 는 랜딩(app/page.tsx)도 쓴다. API 가 죽었을 때 여기서 던지면
     * 처음 온 비로그인 방문자에게 히어로·가입 버튼 대신 오류 화면이 뜬다 —
     * 로그인할 수도 없는 사람에게 "내 프로젝트로" 버튼만 남는 막다른 길이다.
     *
     * 401 은 `lib/api.ts` 가 /login 으로 보내는 자기 복구 경로가 있고,
     * 그 밖의 실패는 아바타 자리가 비는 정도로 끝나는 게 맞다.
     */
    throwOnError: false,
  });

  const initials = (me?.displayName ?? me?.email ?? '··').slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:gap-6 sm:px-6">
      {/*
        로그인한 사용자에게만. 랜딩도 이 Topbar 를 쓰는데 비로그인은 드로어에 넣을 게 없다.
        인증 화면에서는 `me` 가 도착하기 전에도 자리를 비워 둔다 — 안 그러면 응답이
        오는 순간 햄버거가 왼쪽에 끼어들며 헤더 전체가 56px 옆으로 밀린다.
      */}
      {me ? (
        <MobileNav me={me} />
      ) : authed ? (
        <span className="h-11 w-11 shrink-0 md:hidden" aria-hidden />
      ) : null}

      {/*
        드로어에도 같은 로고가 있지만 감추지 않는다. 드로어는 모달 오버레이라
        열리면 이 헤더를 덮으므로 둘이 동시에 보이는 일이 없고, 여기서 빼면 좁은
        화면의 헤더에 햄버거만 남아 텅 빈다(nav 와 아바타는 이미 md 미만에서 숨김).
      */}
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
