'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OAuthButtons } from '@/components/oauth-buttons';
import { AuthHeader } from '@/components/auth/auth-header';

export default function SignupPage() {
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
      await api(ApiPaths.signup, { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setError('이미 사용 중인 이메일입니다.');
      } else {
        setError('회원가입에 실패했습니다.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <AuthHeader />
      <h1 className="text-display-md font-semibold">회원가입</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block space-y-1">
          <span className="text-caption text-muted-foreground">이메일</span>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-caption text-muted-foreground">
            비밀번호 (10자 이상, 영문+숫자)
          </span>
          <Input
            type="password"
            required
            minLength={10}
            pattern="(?=.*[A-Za-z])(?=.*\d).{10,}"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-body-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? '가입 중…' : '회원가입'}
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-caption text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        또는
        <span className="h-px flex-1 bg-border" />
      </div>
      <OAuthButtons />
      <p className="mt-6 text-body-sm text-muted-foreground">
        이미 계정이 있나요?{' '}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
