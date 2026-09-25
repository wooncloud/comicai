import Link from 'next/link';

/**
 * 약관·개인정보 처리방침 링크.
 *
 * **두 자리에 있다.** 랜딩 푸터(`app/page.tsx`)와 설정 화면 맨 아래
 * (`app/settings/layout.tsx`). 앞쪽은 법이 요구하는 공개 게재이고, 뒤쪽은
 * 가입할 때 동의한 약관을 나중에 다시 볼 길이다 — 랜딩에만 두면 이미
 * 가입한 사람은 로그아웃해야 볼 수 있다.
 *
 * 로그인 후 **모든 화면**의 푸터였던 것을 설정 한 곳으로 줄였다. 작업하는
 * 화면 아래에 상주할 만큼 자주 여는 링크가 아니다.
 *
 * `/health` 는 여기 없다. 로그인 없이 누구나 열 수 있는 운영자용 점검
 * 페이지라(주소를 알면 그대로 열린다), 푸터에 내걸 것은 아니다.
 *
 * `prefetch={false}`: 클릭률이 낮은 법적 링크다. 기본 프리페치는 푸터가
 * 화면에 들어오기만 해도 RSC 페이로드 7kB(gzip)를 미리 받는다.
 */
const LINKS = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보 처리방침' },
] as const;

export function FooterLinks() {
  return (
    /*
     * `-mx-3` 은 첫·마지막 링크의 좌우 패딩을 상쇄한다. 랜딩 푸터는 오른쪽,
     * 설정 화면은 왼쪽 정렬이라 한쪽만 상쇄하면 다른 쪽에서 3 만큼 어긋난다.
     */
    <div className="-mx-3 flex flex-wrap items-center">
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
