import Link from 'next/link';

/**
 * 약관·개인정보 처리방침·상태 링크.
 *
 * 랜딩 푸터와 AppShell 푸터가 **같은 목록**을 써야 한다. 한쪽에만 두면
 * 이미 가입한 사람이 약관을 다시 볼 방법이 없어진다 — 실제로 그런 상태였다.
 *
 * `prefetch={false}`: 클릭률이 낮은 법적 링크다. 기본 프리페치는 푸터가
 * 화면에 들어오기만 해도 RSC 페이로드 7kB(gzip)를 미리 받는다.
 */
const LINKS = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보 처리방침' },
  { href: '/health', label: '상태' },
] as const;

export function FooterLinks() {
  return (
    /* `-mr-3` 은 마지막 링크의 좌우 패딩을 상쇄해 오른쪽 정렬선을 맞춘다. */
    <div className="-mr-3 flex items-center">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          className="flex h-11 items-center px-3 hover:text-foreground"
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
