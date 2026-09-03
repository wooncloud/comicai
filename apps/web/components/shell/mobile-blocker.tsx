import Link from 'next/link';

/**
 * 768px 미만 뷰포트를 풀스크린으로 차단. iPad mini 세로(768px) 이상은 통과.
 * CSS-only(`md:hidden`)로 동작하므로 JS 비활성·하이드레이션 전에도 가려진다.
 *
 * 예전에는 루트 레이아웃에서 모든 라우트를 덮었지만, 작은 화면에서 정말 못 쓰는 것은
 * tldraw 캔버스뿐이다. 목록을 보고 결과물을 확인하는 화면은 모바일에서도 쓸모가 있어
 * 지금은 **페이지 에디터에서만** 마운트한다.
 *
 * @param backHref 차단됐을 때 돌아갈 곳. 에디터라면 해당 프로젝트 페이지.
 */
export function MobileBlocker({ backHref = '/dashboard' }: { backHref?: string }) {
  return (
    <div
      id="mobile-blocker"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center md:hidden"
      role="alertdialog"
      aria-label="모바일 미지원 안내"
    >
      <div className="text-display-md font-semibold">화면이 너무 작아요</div>
      <p className="max-w-sm text-body-lg text-muted-foreground [text-wrap:pretty]">
        페이지 편집은 패널을 직접 그리고 옮겨야 해서 태블릿(iPad 등) 또는 데스크톱에서만 동작합니다.
        작품과 생성 결과를 둘러보는 것은 이 기기에서도 가능합니다.
      </p>
      <Link
        href={backHref}
        className="mt-2 flex h-11 items-center px-4 text-body-sm font-medium text-primary-strong underline-offset-4 hover:underline"
      >
        돌아가기
      </Link>
    </div>
  );
}
