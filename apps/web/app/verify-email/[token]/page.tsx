'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ApiPaths } from '@comicai/types';

type Status = 'pending' | 'success' | 'expired' | 'invalid' | 'error';

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState<Status>('pending');

  useEffect(() => {
    if (!token) return;
    api(ApiPaths.verifyEmail(token), { method: 'POST' })
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.code === 'TOKEN_EXPIRED') setStatus('expired');
          else if (err.code === 'TOKEN_INVALID') setStatus('invalid');
          else setStatus('error');
        } else {
          setStatus('error');
        }
      });
  }, [token]);

  return (
    <main className="mx-auto max-w-sm px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">이메일 인증</h1>
      <div className="mt-8 text-sm">{statusText(status)}</div>
      <Link href="/projects" className="mt-8 inline-block underline">
        프로젝트로 이동
      </Link>
    </main>
  );
}

function statusText(status: Status): string {
  switch (status) {
    case 'pending':
      return '인증 중…';
    case 'success':
      return '이메일이 인증되었습니다.';
    case 'expired':
      return '인증 링크가 만료되었습니다. 설정에서 재발송할 수 있습니다.';
    case 'invalid':
      return '인증 링크가 유효하지 않습니다.';
    case 'error':
      return '인증 처리 중 오류가 발생했습니다.';
  }
}
