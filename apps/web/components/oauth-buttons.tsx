'use client';
import { ApiPaths, type OAuthProvider } from '@comicai/types';
import { API_BASE } from '@/lib/api';
import { Button } from '@/components/ui/button';

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Google로 계속하기' },
  { id: 'github', label: 'GitHub로 계속하기' },
];

interface Props {
  returnTo?: string;
}

export function OAuthButtons({ returnTo }: Props) {
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => {
        const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
        return (
          <Button key={p.id} asChild variant="outline" className="w-full">
            <a href={`${API_BASE}${ApiPaths.oauthRedirect(p.id)}${qs}`}>{p.label}</a>
          </Button>
        );
      })}
    </div>
  );
}
