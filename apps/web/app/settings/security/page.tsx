'use client';
import { useEffect, useState } from 'react';
import { api, API_BASE, ApiError } from '@/lib/api';
import {
  ApiPaths,
  OAUTH_PROVIDERS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  type SessionInfo,
  type SessionUser,
} from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SecurityPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  async function refresh() {
    const [u, list] = await Promise.all([
      api<SessionUser>(ApiPaths.me),
      api<SessionInfo[]>(ApiPaths.meSessions),
    ]);
    setMe(u);
    setSessions(list);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  return (
    <div className="space-y-12">
      <EmailVerificationSection me={me} />
      <PasswordSection me={me} onChanged={refresh} />
      <OAuthSection me={me} />
      <SessionsSection sessions={sessions} onChanged={refresh} />
    </div>
  );
}

function EmailVerificationSection({ me }: { me: SessionUser | null }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function resend() {
    setPending(true);
    try {
      await api(ApiPaths.verifyEmailRequest, { method: 'POST' });
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">이메일</h2>
      <div className="flex items-center gap-3 text-sm">
        <span>{me.email}</span>
        <Button variant="outline" size="sm" disabled={pending || done} onClick={resend}>
          {done ? '발송됨' : pending ? '발송 중…' : '인증 메일 재발송'}
        </Button>
      </div>
    </section>
  );
}

function PasswordSection({ me, onChanged }: { me: SessionUser | null; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      await api(ApiPaths.mePassword, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setSuccess(true);
      setCurrent('');
      setNext('');
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_PASSWORD') {
        setError('현재 비밀번호가 올바르지 않습니다.');
      } else if (err instanceof ApiError && err.code === 'PASSWORD_REQUIRED') {
        setError('OAuth 전용 계정입니다. 비밀번호 설정은 추후 지원.');
      } else {
        setError('비밀번호 변경에 실패했습니다.');
      }
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">비밀번호</h2>
      <form onSubmit={onSubmit} className="space-y-3">
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-600">
            변경되었습니다. 다른 세션은 모두 로그아웃됩니다.
          </p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? '변경 중…' : '비밀번호 변경'}
        </Button>
      </form>
    </section>
  );
}

function OAuthSection({ me }: { me: SessionUser | null }) {
  if (!me) return null;
  const linked = new Set(me.oauthProviders ?? []);
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">외부 로그인</h2>
      <ul className="space-y-2 text-sm">
        {OAUTH_PROVIDERS.map((p) => (
          <li
            key={p}
            className="flex items-center justify-between rounded-md border border-border px-4 py-2"
          >
            <span className="capitalize">{p}</span>
            {linked.has(p) ? (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                연결됨
              </span>
            ) : (
              <Button asChild variant="outline" size="sm">
                <a href={`${API_BASE}${ApiPaths.oauthRedirect(p)}?returnTo=/settings/security`}>
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
  sessions: SessionInfo[] | null;
  onChanged: () => void;
}) {
  async function revoke(sid: string) {
    if (!confirm('이 세션을 종료하시겠습니까?')) return;
    await api(ApiPaths.meSession(sid), { method: 'DELETE' });
    onChanged();
  }

  if (!sessions) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-title-lg font-semibold">활성 세션</h2>
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{shortenUA(s.userAgent)}</span>
                {s.current && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">현재 세션</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {s.ip ?? 'unknown ip'} · 최근 활동 {new Date(s.lastUsedAt).toLocaleString('ko-KR')}
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
  if (!ua) return 'unknown';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  return ua.slice(0, 40);
}
