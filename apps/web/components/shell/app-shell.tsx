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
import { EmailVerifyBanner } from '@/components/shell/email-verify-banner';
import { MobileNav } from '@/components/shell/mobile-nav';
import { TokenBalance } from '@/components/shell/token-balance';
import { cn } from '@/lib/cn';
import { ADMIN_NAV, PRIMARY_NAV, useLogout } from '@/lib/nav';
import { qk } from '@/lib/query-keys';

/**
 * @param breadcrumb 지금 어디에 있는지. **상단바 안**에 놓인다.
 *
 * 예전에는 화면마다 제목 바로 위에 따로 그렸다. 그런데 에디터는 헤더에 있어서,
 * 프로젝트 → 페이지로 넘어가는 순간 같은 경로가 화면 위에서 아래로 자리를 옮겼다.
 * 한 줄기로 이어진 화면들이라 그 이동이 특히 눈에 띈다. 전부 헤더로 모은다.
 */
export function AppShell({
  breadcrumb,
  children,
}: {
  breadcrumb?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Topbar authed nav={breadcrumb ? <div className="min-w-0">{breadcrumb}</div> : undefined} />
      <EmailVerifyBanner />
      {/*
        푸터가 없다. 약관·개인정보 처리방침은 랜딩과 설정 화면에 있고
        (`components/shell/footer-links.tsx`), 그 둘이면 법이 요구하는 공개
        게재와 "가입할 때 동의한 것을 다시 본다" 가 모두 된다. 작업하는 화면
        아래에 상주할 만큼 자주 여는 링크가 아니다.
      */}
      <main className="flex-1">{children}</main>
    </div>
  );
}

interface TopbarProps {
  /**
   * 로그인한 사용자만 오는 화면인가.
   * AppShell 을 거치는 화면은 전부 true 다. 랜딩(app/page.tsx)만 Topbar 를 직접
   * 쓰면서 false 로 둔다 — 비로그인 방문자에게 빈 자리를 예약해 둘 이유가 없다.
   */
  authed?: boolean;
  /**
   * 가운데 내비게이션을 대신할 것. 에디터가 브레드크럼을 넣는다.
   *
   * 에디터도 **같은 헤더를 쓴다.** 예전에는 자기만의 헤더를 따로 그려서, 그 화면에
   * 들어가는 순간 로고·계정 메뉴·잔액이 통째로 사라지고 높이와 색이 미묘하게 달랐다.
   * 화면마다 다른 것은 이 줄에 무엇을 얹느냐뿐이어야 한다.
   */
  nav?: React.ReactNode;
  /** 잔액·계정 메뉴 **앞**에 놓일 화면별 동작(저장 상태, 설정집 링크 등). */
  actions?: React.ReactNode;
}

export function Topbar({ authed = false, nav, actions }: TopbarProps) {
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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:gap-6 sm:px-6">
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
      {nav ?? (
        <nav className="hidden items-center gap-1 text-body-sm md:flex">
          {me &&
            /* `account` 항목은 아바타 메뉴에 있다 — 여기 또 내놓지 않는다(`lib/nav.ts`). */
            PRIMARY_NAV.filter((item) => !item.account).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center whitespace-nowrap rounded px-3 py-1.5 transition-colors touch:min-h-11',
                  item.match(path)
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
        </nav>
      )}
      <span className="flex-1" />
      {actions}
      {/* 잔액은 폭에 상관없이 보인다 — 드로어에도 있지만 여는 동작이 한 번 더 든다. */}
      {me && <TokenBalance />}
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
