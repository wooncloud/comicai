'use client';
import { useQuery } from '@tanstack/react-query';
import { ApiPaths, type OAuthProvider } from '@comicai/types';
import type { SVGProps } from 'react';
import { api, API_BASE } from '@/lib/api';
import { Button } from '@/components/ui/button';

// Icon from Material Design Icons by Pictogrammers — https://github.com/Templarian/MaterialDesign/blob/master/LICENSE
function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
      />
    </svg>
  );
}

// Icon from Myna UI Icons by Praveen Juge — https://github.com/praveenjuge/mynaui-icons/blob/main/LICENSE
function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12.183 2.75c-3.683 0-6.902 2.031-8.419 5.088a9.05 9.05 0 0 0 0 8.325c1.517 3.056 4.736 5.087 8.419 5.087c2.54 0 4.72-.827 6.244-2.224c2.484-2.173 3.185-5.599 2.658-8.688a.25.25 0 0 0-.246-.208h-8.656a.25.25 0 0 0-.25.25v3.33c0 .138.112.25.25.25h4.768c-.166.74-.687 1.747-1.685 2.423l-.008.005c-.685.502-1.735.852-3.075.852c-2.936 0-5.275-2.455-5.275-5.33c0-2.783 2.472-5.24 5.275-5.24c1.67 0 2.72.683 3.429 1.29a.25.25 0 0 0 .337-.011l2.578-2.52a.25.25 0 0 0-.011-.368c-1.609-1.388-3.784-2.311-6.333-2.311"
      />
    </svg>
  );
}

type IconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const PROVIDERS: { id: OAuthProvider; label: string; Icon: IconComponent }[] = [
  { id: 'google', label: 'Google로 계속하기', Icon: GoogleIcon },
  { id: 'github', label: 'GitHub로 계속하기', Icon: GithubIcon },
];

interface Props {
  returnTo?: string;
}

export function OAuthButtons({ returnTo }: Props) {
  /*
   * 서버가 켜져 있다고 알려 준 것만 보여 준다.
   *
   * 예전에는 환경변수와 무관하게 항상 보였다. 설정하지 않은 상태로 누르면 API 도메인의
   * JSON 에러 화면에 떨어졌고, 거기서는 앱으로 돌아올 방법도 안내되지 않았다.
   *
   * 응답이 오기 전에는 아무것도 그리지 않는다 — 버튼을 먼저 보였다가 없애면 누르려던
   * 손가락 밑에서 사라진다.
   */
  const { data } = useQuery<{ providers: OAuthProvider[] }>({
    queryKey: ['oauth-providers'],
    queryFn: () => api<{ providers: OAuthProvider[] }>(ApiPaths.oauthProviders),
    // 배포 중에 바뀌지 않는 값이다. 화면을 옮길 때마다 다시 물을 이유가 없다.
    staleTime: Infinity,
    retry: false,
  });
  const enabled = data?.providers;
  if (!enabled || enabled.length === 0) return null;

  return (
    <>
      {/* 구분선도 여기 있어야 한다. 밖에 두면 버튼이 숨겨졌을 때 "또는" 만 남는다. */}
      <div className="my-6 flex items-center gap-3 text-caption text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-2">
        {PROVIDERS.filter((p) => enabled.includes(p.id)).map(({ id, label, Icon }) => {
          const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
          return (
            <Button key={id} asChild variant="outline" className="w-full">
              <a href={`${API_BASE}${ApiPaths.oauthRedirect(id)}${qs}`}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </a>
            </Button>
          );
        })}
      </div>
    </>
  );
}
