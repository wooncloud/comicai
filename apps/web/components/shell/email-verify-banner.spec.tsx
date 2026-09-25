import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionUser } from '@comicai/types';
import { EmailVerifyBanner } from './email-verify-banner';
import { ToastProvider } from '@/components/ui/toast';
import { qk } from '@/lib/query-keys';

function mount(me: SessionUser | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (me) qc.setQueryData(qk.me(), me);
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EmailVerifyBanner />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const base: SessionUser = {
  id: 'u1',
  email: 'someone@example.com',
  displayName: null,
  avatarUrl: null,
  emailVerified: false,
};

describe('EmailVerifyBanner', () => {
  it('인증 전이면 이메일과 함께 안내가 뜬다', () => {
    mount(base);
    expect(screen.getByText(/이메일 인증이 아직 안 끝났습니다/)).toBeTruthy();
    expect(screen.getByText('someone@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: '메일 다시 보내기' })).toBeTruthy();
  });

  it('인증을 끝냈으면 아무것도 그리지 않는다', () => {
    const { container } = mount({ ...base, emailVerified: true });
    expect(container.textContent).toBe('');
  });

  it('로그인 정보를 아직 못 읽었으면 조용히 비운다 — 랜딩/로그아웃 상태에서 깜빡이지 않게', () => {
    const { container } = mount(undefined);
    expect(container.textContent).toBe('');
  });
});
