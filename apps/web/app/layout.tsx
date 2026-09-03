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
 * Next.js 가 넣어 주는 기본값과 같은 내용이지만, 명시적으로 남겨 둔다.
 *
 * 입력 포커스 시 iOS 가 화면을 확대하는 문제를 `maximumScale: 1` 이나
 * `userScalable: false` 로 막고 싶어질 수 있는데, 그러면 저시력 사용자가
 * 핀치 줌으로 화면을 키우는 것까지 막혀 접근성 기준(WCAG 1.4.4)에 걸린다.
 * 자동 확대는 입력 폰트를 16px 이상으로 두어 해결했다 — globals.css 참고.
 *
 * viewport-fit: 'cover'(노치 뒤까지 그리기)는 넣지 않았다. safe-area 패딩을
 * 같이 넣지 않으면 하단 홈 인디케이터가 콘텐츠를 덮는다.
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
