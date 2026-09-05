'use client';
import { useState } from 'react';
import { api, API_BASE } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import {
  ApiPaths,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  type SessionInfo,
  type SessionUser,
} from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { PROVIDERS, useOAuthProviders } from '@/components/oauth-buttons';
import { useConfirm } from '@/components/ui/confirm';

export default function SecurityPage() {
  const queryClient = useQueryClient();

  /*
   * 예전에는 `useState` + `refresh().catch(() => {})` 였다. 조회가 하나라도 실패하면
   * 오류가 **삼켜지고** 두 값이 null 로 남아, 네 섹션이 전부 `return null` 로 아무것도
   * 그리지 않았다 — 사용자는 설정 탭만 있고 본문이 텅 빈 화면을 보고 "계정에 아무것도
   * 없다" 로 읽는다. 로딩 표시도 오류 문구도 재시도 수단도 없었다.
   *
   * `me` 는 상단바와 같은 캐시(`qk.me()`)를 쓴다. 프로필에서 이름을 바꾸면 여기도
   * 함께 최신이 된다 — 예전에는 이 화면만 동기화에서 빠져 옛 값을 계속 보여 줬다.
   */
  const { data: me } = useQuery<SessionUser>({
    queryKey: qk.me(),
    queryFn: () => api<SessionUser>(ApiPaths.me),
  });
  const { data: sessions } = useQuery<SessionInfo[]>({
    queryKey: qk.meSessions(),
    queryFn: () => api<SessionInfo[]>(ApiPaths.meSessions),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.me() }),
      queryClient.invalidateQueries({ queryKey: qk.meSessions() }),
    ]);
  }

  return (
    <div className="space-y-12">
      <EmailVerificationSection me={me} />
      <PasswordSection me={me} onChanged={refresh} />
      <OAuthSection me={me} />
      <SessionsSection sessions={sessions} onChanged={refresh} />
    </div>
  );
}

function EmailVerificationSection({ me }: { me: SessionUser | undefined }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  async function resend() {
    setPending(true);
    try {
      await api(ApiPaths.verifyEmailRequest, { method: 'POST' });
      setDone(true);
      toast.push('success', '인증 메일이 발송되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '인증 메일을 발송'));
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">이메일</h2>
      <div className="flex flex-wrap items-center gap-3 text-body-sm">
        <span className="min-w-0 break-all">{me.email}</span>
        <Button variant="outline" size="sm" disabled={pending || done} onClick={resend}>
          {done ? '발송됨' : pending ? '발송 중…' : '인증 메일 재발송'}
        </Button>
      </div>
    </section>
  );
}

function PasswordSection({
  me,
  onChanged,
}: {
  me: SessionUser | undefined;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pending, setPending] = useState(false);
  const toast = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await api(ApiPaths.mePassword, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setCurrent('');
      setNext('');
      onChanged();
      toast.push('success', '비밀번호가 변경되었습니다. 다른 기기에서는 모두 로그아웃됩니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '비밀번호를 변경'));
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">비밀번호</h2>
      <form onSubmit={onSubmit} className="max-w-lg space-y-3">
        <Input
          type="password"
          placeholder="현재 비밀번호"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          type="password"
          placeholder="새 비밀번호 (10자 이상, 영문+숫자)"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          pattern={PASSWORD_PATTERN}
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? '변경 중…' : '비밀번호 변경'}
        </Button>
      </form>
    </section>
  );
}

function OAuthSection({ me }: { me: SessionUser | undefined }) {
  /*
   * 로그인 화면과 같은 목록을 본다. 예전에는 지원 가능한 제공자를 전부 그려서,
   * 꺼져 있는 제공자의 "연결" 버튼이 API 도메인의 JSON 에러 화면으로 떨어졌다.
   *
   * 이미 연결된 것은 꺼져 있어도 보여 준다 — 연결 사실 자체가 정보다.
   */
  const enabled = useOAuthProviders();
  const linked = new Set(me?.oauthProviders ?? []);
  // `||` 를 `??` 로 바꾸면 안 된다 — `enabled` 가 로드돼 false 를 주면 `??` 는 거기서
  // 멈춰 이미 연결된 provider 를 목록에서 지운다. undefined 만 false 로 접는다.
  const rows = PROVIDERS.filter((p) => (enabled?.includes(p.id) ?? false) || linked.has(p.id));

  if (!me || rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">외부 로그인</h2>
      <ul className="space-y-2 text-body-sm">
        {rows.map(({ id, name, Icon }) => (
          <li
            key={id}
            className="flex items-center justify-between rounded-md border border-border px-4 py-2"
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              {name}
            </span>
            {linked.has(id) ? (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-caption text-emerald-700 dark:text-emerald-300">
                연결됨
              </span>
            ) : (
              <Button asChild variant="outline" size="sm">
                <a href={`${API_BASE}${ApiPaths.oauthRedirect(id)}?returnTo=/settings/security`}>
                  연결
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionsSection({
  sessions,
  onChanged,
}: {
  sessions: SessionInfo[] | undefined;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  async function revoke(sid: string) {
    const ok = await confirm({
      title: '이 기기에서 로그아웃할까요?',
      body: '해당 기기의 세션이 즉시 끊깁니다.',
      confirmLabel: '로그아웃',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(ApiPaths.meSession(sid), { method: 'DELETE' });
      onChanged();
      toast.push('success', '해당 기기에서 로그아웃되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '로그아웃'));
    }
  }

  if (!sessions) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">로그인된 기기</h2>
      <ul className="divide-y divide-border rounded-md border border-border text-body-sm">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{shortenUA(s.userAgent)}</span>
                {s.current && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-caption">
                    지금 사용 중
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-caption text-muted-foreground">
                {s.ip ?? 'IP 정보 없음'} · 최근 활동{' '}
                {new Date(s.lastUsedAt).toLocaleString('ko-KR')}
              </div>
            </div>
            {!s.current && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => revoke(s.id)}
              >
                로그아웃
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function shortenUA(ua: string | null): string {
  if (!ua) return '알 수 없는 기기';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  return ua.slice(0, 40);
}
