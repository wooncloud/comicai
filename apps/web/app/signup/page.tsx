'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

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
      await api('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/settings');
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
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">회원가입</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm">비밀번호 (10자 이상, 영문+숫자)</span>
          <input
            type="password"
            required
            minLength={10}
            pattern="(?=.*[A-Za-z])(?=.*\d).{10,}"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? '가입 중…' : '회원가입'}
        </button>
      </form>
      <p className="mt-6 text-sm text-neutral-600">
        이미 계정이 있나요?{' '}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
