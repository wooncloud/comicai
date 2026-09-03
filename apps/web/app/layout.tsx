import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Pretendard variable: https://github.com/orioncactus/pretendard 의 woff2 단일 파일 사용.
const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
});

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
    <html lang="ko" className={`${pretendard.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
