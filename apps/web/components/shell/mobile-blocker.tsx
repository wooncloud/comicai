import Link from 'next/link';

/**
 * 768px 미만 뷰포트(일반 모바일)를 풀스크린으로 차단. iPad mini 세로(768px) 이상은 통과.
 * CSS-only로 동작하므로 JS 비활성/하이드레이션 전에도 가려진다.
 *
 * 루트 레이아웃에 있어 모든 라우트를 덮는다. 모바일에서도 열려야 하는 페이지는
 * `<AllowMobileView />` 를 렌더해 자기 라우트에서만 이 차단을 해제한다.
 */
export function MobileBlocker() {
  return (
    <div
      id="mobile-blocker"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center md:hidden"
      role="alertdialog"
      aria-label="모바일 미지원 안내"
    >
      <div className="text-display-md font-semibold">화면이 너무 작아요</div>
      <p className="max-w-sm text-body-lg text-muted-foreground [text-wrap:pretty]">
        ComicAI 는 정밀한 캔버스 편집을 위해 태블릿(iPad 등) 또는 데스크톱 환경에서만 동작합니다.
        화면이 더 큰 기기에서 다시 접속해 주세요.
      </p>
      <Link
        href="/"
        className="mt-2 flex h-11 items-center px-4 text-body-sm font-medium text-primary-strong underline-offset-4 hover:underline"
      >
        소개 페이지로 돌아가기
      </Link>
    </div>
  );
}

/**
 * 이 페이지에서는 모바일 차단을 해제한다. 랜딩처럼 읽기 전용이고 작은 화면에서도
 * 온전히 보이는 라우트만 사용한다.
 *
 * `usePathname()` 대신 CSS 로 처리하는 이유: 차단이 하이드레이션 전에도 걸려 있어야 하는데,
 * 라우트를 JS 로 판별하면 그 사이에 차단이 깜빡이거나(랜딩) 잠깐 열린다(보호 라우트).
 */
export function AllowMobileView() {
  return <style>{`@media (max-width: 767px){#mobile-blocker{display:none}}`}</style>;
}
