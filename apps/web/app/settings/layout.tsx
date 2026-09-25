'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { FooterLinks } from '@/components/shell/footer-links';
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

        {/*
          가입할 때 동의한 약관을 다시 볼 자리. 예전에는 로그인 후 모든 화면의
          푸터에 있었는데, 그림 그리는 화면 아래에 상주할 만큼 자주 여는 링크가
          아니다. 계정에 관한 것들이 모인 여기가 찾을 만한 곳이다.
        */}
        <div className="mt-16 border-t border-border pt-4 text-caption text-muted-foreground">
          <FooterLinks />
        </div>
      </PageContainer>
    </AppShell>
  );
}
