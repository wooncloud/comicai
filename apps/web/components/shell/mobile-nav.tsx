'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import type { SessionUser } from '@comicai/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { ADMIN_NAV, PRIMARY_NAV, SETTINGS_NAV, useLogout } from '@/lib/nav';

/**
 * 좁은 화면용 내비게이션 드로어.
 *
 * 상단바에 링크를 그대로 늘어놓으면 320px 에서 로고·메뉴·아바타가 헤더 폭을 넘는다.
 * 그래서 폭이 좁을 때만 햄버거로 접는다 — 여기서 가르는 축은 **화면 폭**이 맞다
 * (터치 여부를 가르는 `touch:` 와 혼동하지 말 것. 태블릿은 터치지만 폭은 넉넉하다).
 *
 * 로그인하지 않았으면 렌더하지 않는다. 랜딩(app/page.tsx)도 이 Topbar 를 쓰는데,
 * 비로그인 사용자에게는 드로어에 넣을 항목이 하나도 없다.
 */
export function MobileNav({ me }: { me: SessionUser }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const logout = useLogout();

  // 링크를 눌러 이동하면 드로어는 닫혀야 한다. Radix 는 라우팅을 모른다.
  useEffect(() => {
    setOpen(false);
  }, [path]);

  const initials = (me.displayName ?? me.email).slice(0, 2).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="메뉴 열기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="left" className="p-0">
        <SheetTitle className="sr-only">메뉴</SheetTitle>

        {/*
          로고가 드로어 맨 위에 있다. 높이를 상단바와 같은 h-14 로 맞춘 이유:
          드로어가 열릴 때 로고가 원래 있던 자리에 그대로 남아 있는 것처럼 보인다.
          위치가 튀면 같은 로고가 두 개인 것처럼 읽힌다.
        */}
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4 pr-14">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-title-md font-semibold touch:min-h-11"
          >
            <Image src="/brush.svg" alt="" width={26} height={26} />
            ComicAI
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4">
          <Avatar className="h-9 w-9 shrink-0">
            {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-body-sm font-medium">{me.displayName ?? '이름 없음'}</div>
            <div className="truncate text-caption text-muted-foreground">{me.email}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {PRIMARY_NAV.map((item) => {
            const active = item.match(path ?? '');
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-11 items-center rounded-md px-3 text-body-sm transition-colors',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>

                {/*
                  설정 하위를 펼쳐 둔다. 접어 두면 "프로필" 로 가는 데 드로어 →
                  설정 → 탭 세 단계가 걸리는데, 그러려고 드로어를 만든 게 아니다.
                */}
                {item.href === '/settings/profile' && active && (
                  <div className="ml-3 mt-1 border-l border-border pl-2">
                    {SETTINGS_NAV.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          'flex min-h-11 items-center rounded-md px-3 text-body-sm transition-colors',
                          path === sub.href
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {me.isAdmin && (
            <Link
              href={ADMIN_NAV.href}
              className={cn(
                'flex min-h-11 items-center rounded-md px-3 text-body-sm transition-colors',
                path === ADMIN_NAV.href
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ADMIN_NAV.label}
            </Link>
          )}
        </nav>

        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={logout}
            className="flex min-h-11 w-full items-center rounded-md px-3 text-body-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            로그아웃
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
