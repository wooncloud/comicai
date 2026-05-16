'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OAuthButtons } from '@/components/oauth-buttons';

function LoginBanner() {
  const params = useSearchParams();
  const reset = params.get('reset');
  const errorParam = params.get('error');
  if (reset === 'ok') {
    return (
      <p className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
        비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
      </p>
    );
  }
  if (errorParam) {
    return (
      <p className="mt-6 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {oauthErrorMessage(errorParam)}
      </p>
    );
  }
  return null;
}

function oauthErrorMessage(code: string): string {
  switch (code) {
    case 'oauth_provider_disabled':
      return '해당 OAuth Provider가 활성화되지 않았습니다.';
    case 'oauth_state_invalid':
      return 'OAuth 세션이 만료되었습니다. 다시 시도해주세요.';
    case 'oauth_missing_params':
      return 'OAuth 응답이 누락되었습니다.';
    default:
      return `OAuth 로그인 실패: ${code}`;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api(ApiPaths.login, { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/projects');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError('로그인에 실패했습니다.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">로그인</h1>
      <Suspense>
        <LoginBanner />
      </Suspense>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm">이메일</span>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-sm">비밀번호</span>
          <Input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? '로그인 중…' : '로그인'}
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는
        <span className="h-px flex-1 bg-border" />
      </div>
      <OAuthButtons />
      <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
        <Link href="/signup" className="underline">
          회원가입
        </Link>
        <Link href="/forgot-password" className="underline">
          비밀번호 찾기
        </Link>
      </div>
    </main>
  );
}
