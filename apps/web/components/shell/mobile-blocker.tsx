/**
 * 768px 미만 뷰포트(일반 모바일)를 풀스크린으로 차단. iPad mini 세로(768px) 이상은 통과.
 * CSS-only로 동작하므로 JS 비활성/하이드레이션 전에도 가려진다.
 */
export function MobileBlocker() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center md:hidden"
      role="alertdialog"
      aria-label="모바일 미지원 안내"
    >
      <div className="text-display font-semibold">화면이 너무 작아요</div>
      <p className="max-w-sm text-body text-muted-foreground">
        ComicAI 는 정밀한 캔버스 편집을 위해 태블릿(iPad 등) 또는 데스크톱 환경에서만 동작합니다.
        화면 가로폭 768px 이상의 기기에서 다시 접속해 주세요.
      </p>
    </div>
  );
}
