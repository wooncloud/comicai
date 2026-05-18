'use client';
import { ApiPaths, type OAuthProvider } from '@comicai/types';
import type { SVGProps } from 'react';
import { API_BASE } from '@/lib/api';
import { Button } from '@/components/ui/button';

// Icon from Material Design Icons by Pictogrammers — https://github.com/Templarian/MaterialDesign/blob/master/LICENSE
function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
    >
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
    >
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
  return (
    <div className="space-y-2">
      {PROVIDERS.map(({ id, label, Icon }) => {
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
  );
}
