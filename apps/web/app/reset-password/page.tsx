'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api(ApiPaths.passwordResetConfirm, {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      router.replace('/login?reset=ok');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TOKEN_EXPIRED') setError('재설정 링크가 만료되었습니다.');
        else if (err.code === 'TOKEN_INVALID') setError('재설정 링크가 유효하지 않습니다.');
        else setError('비밀번호를 재설정하지 못했습니다.');
      } else {
        setError('비밀번호를 재설정하지 못했습니다.');
      }
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-destructive">유효하지 않은 링크입니다.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm">새 비밀번호 (10자 이상, 영문+숫자)</span>
        <Input
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          pattern={PASSWORD_PATTERN}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? '변경 중…' : '비밀번호 변경'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">새 비밀번호 설정</h1>
      <Suspense fallback={<p className="mt-8 text-sm">로딩…</p>}>
        <ResetPasswordForm />
      </Suspense>
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/login" className="underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
