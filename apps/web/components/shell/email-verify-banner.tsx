'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiPaths, type SessionUser } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { qk } from '@/lib/query-keys';

/**
 * 이메일 인증이 아직인 사람에게만 보이는 한 줄.
 *
 * **없을 때 무슨 일이 있었나.** 가입하면 인증 메일이 나가는데(`auth.controller.ts`)
 * 화면은 그 사실을 어디서도 말하지 않고 곧장 대시보드로 보냈다. 사용자는 메일이
 * 갔는지도, 인증이 필요한지도 모른 채 쓰다가 `/admin` 같은 데서 "접근할 수 없는
 * 화면입니다" 만 보게 된다 — 이유가 이메일 인증이라는 말은 아무 데도 없었다.
 *
 * 닫기를 두지 않는다. 닫아 둔 채 잊으면 원래 상태로 돌아간다. 인증이 끝나면
 * `emailVerified` 가 true 가 되면서 저절로 사라진다.
 *
 * 에디터는 `AppShell` 을 쓰지 않으므로 그림 그리는 동안에는 뜨지 않는다.
 */
export function EmailVerifyBanner() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const { data: me } = useQuery<SessionUser>({
    queryKey: qk.me(),
    queryFn: () => api<SessionUser>(ApiPaths.me),
    retry: false,
    // 잔액 배지와 같은 이유로 오류 경계로 던지지 않는다 — 이 줄 하나 때문에
    // 화면 전체가 오류로 바뀌면 안 된다.
    throwOnError: false,
  });

  if (!me || me.emailVerified) return null;

  async function resend() {
    setPending(true);
    try {
      await api(ApiPaths.verifyEmailRequest, { method: 'POST' });
      setSent(true);
      toast.push('success', '인증 메일을 다시 보냈습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '인증 메일을 발송'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2 text-caption">
        <MailWarning className="h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden />
        <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
          <span className="font-medium">이메일 인증이 아직 안 끝났습니다.</span>{' '}
          <span className="break-all">{me.email}</span> 로 보낸 메일의 링크를 눌러 주세요.
        </p>
        <Button variant="outline" size="sm" disabled={pending || sent} onClick={resend}>
          {sent ? '다시 보냈습니다' : pending ? '보내는 중…' : '메일 다시 보내기'}
        </Button>
        <Link href="/settings/security" className="underline underline-offset-2">
          설정에서 보기
        </Link>
      </div>
    </div>
  );
}
