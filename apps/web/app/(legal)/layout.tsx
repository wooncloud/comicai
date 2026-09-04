import Link from 'next/link';
import { AuthHeader } from '@/components/auth/auth-header';

/**
 * 약관·개인정보 처리방침 공통 레이아웃.
 *
 * AppShell 을 쓰지 않는다 — 가입 화면에서 새 탭으로 여는 문서라, 로그인하지 않은
 * 사람도 봐야 하고 상단바의 내비게이션은 여기서 의미가 없다.
 *
 * 본문 폭을 `max-w-2xl` 로 좁힌 이유는 읽기 위한 글이기 때문이다. 앱 화면의
 * `PageContainer`(1152px)를 쓰면 줄이 너무 길어 눈이 되돌아올 자리를 놓친다.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <AuthHeader />
      <article className="prose-legal">{children}</article>
      <footer className="mt-16 border-t border-border pt-6 text-body-sm text-muted-foreground">
        <Link href="/" className="tap-link underline">
          ComicAI 홈으로
        </Link>
      </footer>
    </main>
  );
}
