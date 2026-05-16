import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'ComicAI',
  description: 'AI 만화 제작 도구',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
