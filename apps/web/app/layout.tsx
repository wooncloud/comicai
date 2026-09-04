import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './pretendard.css';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/*
 * Pretendard 는 `next/font/local` 이 아니라 `pretendard.css` 의 @font-face 로 싣는다.
 *
 * `next/font/local` 은 파일 한 벌만 받아서 unicode-range 로 나눌 수 없다. 그런데
 * 원본은 2.0MB 이고 그게 **모든 라우트에 preload** 로 박힌다 — 한글 몇 줄짜리
 * 로그인 화면도 2MB 를 받았다. 조각 낸 이유와 나누는 기준은 `scripts/build-fonts.py`
 * 에 있고, 그 스크립트가 CSS 도 함께 생성한다.
 */

export const metadata: Metadata = {
  title: 'ComicAI',
  description: 'AI 만화 제작 도구',
  icons: {
    icon: '/brush.svg',
    shortcut: '/brush.svg',
    apple: '/brush.svg',
  },
};

/**
 * Next.js 기본값과 같지만, 확대 관련 옵션을 여기 넣지 말라는 표시로 남겨 둔다.
 * 자동 확대는 입력 폰트로 해결했다 — 근거는 globals.css 의 모바일 섹션.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={inter.variable}>
      <body className="font-sans antialiased">
        <Providers>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
