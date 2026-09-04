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
import { errorMessage } from '@/lib/error-message';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api(ApiPaths.signup, {
        method: 'POST',
        body: JSON.stringify({ email, password, agreeToTerms: agreed }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err, '회원가입'));
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
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-caption text-muted-foreground">
            비밀번호 (10자 이상, 영문+숫자)
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            pattern="(?=.*[A-Za-z])(?=.*\d).{10,}"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {/*
          동의는 가입 시점에만 받는다. 기본은 체크 해제 — 미리 체크해 두면 동의를
          받았다고 보기 어렵고, 서버도 literal(true) 로 막고 있어 어차피 통과하지 않는다.
        */}
        <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-body-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
          />
          <span className="text-muted-foreground">
            <Link href="/terms" target="_blank" className="text-foreground underline">
              이용약관
            </Link>
            과{' '}
            <Link href="/privacy" target="_blank" className="text-foreground underline">
              개인정보 처리방침
            </Link>
            에 동의합니다.
          </span>
        </label>
        {error && <p className="text-body-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending || !agreed} className="w-full">
          {pending ? '가입 중…' : '회원가입'}
        </Button>
      </form>
      <OAuthButtons />
      <p className="mt-6 text-body-sm text-muted-foreground">
        이미 계정이 있나요?{' '}
        <Link href="/login" className="tap-link underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
