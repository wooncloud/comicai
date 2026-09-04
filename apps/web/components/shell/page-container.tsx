import { cn } from '@/lib/cn';

/**
 * AppShell 안 모든 화면의 본문 폭.
 *
 * 예전에는 화면마다 제각각이었다 — 대시보드 1152px, 프로젝트 상세 896px,
 * 프로젝트 설정 672px, 설정 896px. 전부 `px-6` 이라 1440px 화면에서 콘텐츠 왼쪽
 * 모서리가 168 / 296 / 408px 로 달랐다.
 *
 * 문제는 이 화면들이 브레드크럼으로 이어진 **한 줄기 경로**라는 것이다. 대시보드 →
 * 프로젝트 → 프로젝트 설정으로 넘어갈 때마다 페이지 전체가 오른쪽으로 128px, 112px
 * 미끄러졌다. 화면 안의 무언가가 바뀐 게 아니라 판이 통째로 움직이는 것처럼 보인다.
 *
 * 그래서 바깥 폭은 하나로 고정하고, 읽기 좋은 줄 길이가 필요한 곳은 **안쪽에서**
 * 제한한다(`max-w-lg` 를 폼에 거는 식). 위치가 아니라 폭만 바뀌므로 시선이 흔들리지 않는다.
 *
 * 1152px(6xl)인 이유: 설정집 화면이 `md:grid-cols-[1fr_320px]` + `lg:grid-cols-2` 로
 * 실제 2~3열을 그린다. 896px 로 좁히면 그 화면의 카드가 무너진다.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mx-auto max-w-6xl px-6 py-10', className)}>{children}</div>;
}
