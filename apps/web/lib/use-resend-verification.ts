'use client';
import { useState } from 'react';
import { ApiPaths } from '@comicai/types';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { useToast } from '@/components/ui/toast';

/**
 * 인증 메일 다시 보내기. 상단 배너와 보안 설정이 같이 쓴다.
 *
 * 예전에는 두 곳이 같은 요청을 각자 보냈고, 성공 문구가 "다시 보냈습니다" 와
 * "발송되었습니다" 로 이미 갈라져 있었다.
 *
 * 한 번 보내면 `sent` 로 버튼을 막는다 — 메일이 늦게 오면 사람은 여러 번 누른다.
 */
export function useResendVerification() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

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

  return { resend, pending, sent };
}
