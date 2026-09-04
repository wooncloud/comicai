'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthHeader } from '@/components/auth/auth-header';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(ApiPaths.passwordResetRequest, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch (err) {
      /*
       * 이 화면만 catch 가 없었다. 429(요청 과다)나 500 이면 버튼이 "전송 중…"
       * 에서 원래대로 돌아올 뿐 성공 배너도 오류 문구도 없어서, 눌린 건지 아닌지
       * 알 수 없어 계속 다시 누르게 되고 그럴수록 레이트리밋에 더 걸렸다.
       */
      setError(errorMessage(err, '재설정 링크를 요청'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <AuthHeader />
      <h1 className="text-display-md font-semibold">비밀번호 재설정</h1>
      {done ? (
        <p className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-body-sm text-emerald-700 dark:text-emerald-300">
          입력하신 이메일로 재설정 링크를 보냈습니다. 메일이 도착하지 않으면 스팸함도 확인해 주세요.
        </p>
      ) : (
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
          {error && <p className="text-body-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? '전송 중…' : '재설정 링크 받기'}
          </Button>
        </form>
      )}
      <p className="mt-6 text-body-sm text-muted-foreground">
        <Link href="/login" className="tap-link underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
