'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeader } from '@/components/auth/auth-header';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await api(ApiPaths.passwordResetRequest, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <AuthHeader />
      <h1 className="text-2xl font-semibold">비밀번호 재설정</h1>
      {done ? (
        <p className="mt-8 text-sm">
          입력하신 이메일로 재설정 링크를 보냈습니다. 메일이 도착하지 않으면 스팸함도 확인해주세요.
        </p>
      ) : (
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
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? '전송 중…' : '재설정 링크 받기'}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/login" className="underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
