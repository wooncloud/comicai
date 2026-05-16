'use client';
import { ApiPaths, type OAuthProvider } from '@comicai/types';
import { Button } from '@/components/ui/button';

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Google로 계속하기' },
  { id: 'github', label: 'GitHub로 계속하기' },
];

interface Props {
  returnTo?: string;
}

export function OAuthButtons({ returnTo }: Props) {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000') + '/v1';
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => {
        const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
        return (
          <Button key={p.id} asChild variant="outline" className="w-full">
            <a href={`${base}${ApiPaths.oauthRedirect(p.id)}${qs}`}>{p.label}</a>
          </Button>
        );
      })}
    </div>
  );
}
