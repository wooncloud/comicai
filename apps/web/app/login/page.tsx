'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OAuthButtons } from '@/components/oauth-buttons';
import { AuthHeader } from '@/components/auth/auth-header';
import { errorMessage, oauthErrorMessage } from '@/lib/error-message';

function LoginBanner() {
  const params = useSearchParams();
  const reset = params.get('reset');
  const errorParam = params.get('error');
  if (reset === 'ok') {
    return (
      <p className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-body-sm text-emerald-700 dark:text-emerald-300">
        비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
      </p>
    );
  }
  if (errorParam) {
    return (
      <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-body-sm text-destructive">
        {oauthErrorMessage(errorParam)}
      </p>
    );
  }
  return null;
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
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err, '로그인'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <AuthHeader />
      <h1 className="text-display-md font-semibold">로그인</h1>
      <Suspense>
        <LoginBanner />
      </Suspense>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block space-y-1">
          <span className="text-caption text-muted-foreground">이메일</span>
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-caption text-muted-foreground">비밀번호</span>
          <Input
            type="password"
            autoComplete="current-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-body-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? '로그인 중…' : '로그인'}
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-caption text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는
        <span className="h-px flex-1 bg-border" />
      </div>
      <OAuthButtons />
      <div className="mt-6 flex items-center justify-between text-body-sm text-muted-foreground">
        <Link href="/signup" className="tap-link underline">
          회원가입
        </Link>
        <Link href="/forgot-password" className="tap-link underline">
          비밀번호 찾기
        </Link>
      </div>
    </main>
  );
}
