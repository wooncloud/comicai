'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type SessionUser } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function ProfileSettingsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SessionUser>(ApiPaths.me)
      .then((u) => {
        setMe(u);
        setDisplayName(u.displayName ?? '');
        setAvatarUrl(u.avatarUrl ?? '');
      })
      .catch(() => setError('프로필을 불러오지 못했습니다.'));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      const updated = await api<SessionUser>(ApiPaths.me, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName || null,
          avatarUrl: avatarUrl || null,
        }),
      });
      setMe(updated);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) setError(`저장 실패: ${err.code}`);
      else setError('저장에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (!me) {
    return <p className="text-body-sm text-muted-foreground">{error ?? '로딩…'}</p>;
  }

  const initials = (me.displayName ?? me.email).slice(0, 2).toUpperCase();
  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-6">
      <header>
        <h2 className="text-title-lg font-semibold">프로필</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          다른 사용자에게 보일 표시 이름과 아바타.
        </p>
      </header>
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <label className="block text-caption text-muted-foreground">아바타 URL</label>
          <Input
            type="url"
            placeholder="https://…"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-caption text-muted-foreground">이름</span>
        <Input
          placeholder="표시 이름"
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-caption text-muted-foreground">이메일</span>
        <Input value={me.email} disabled />
      </label>
      {error && <p className="text-body-sm text-destructive">{error}</p>}
      {success && <p className="text-body-sm text-emerald-600">저장되었습니다.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '저장'}
      </Button>
    </form>
  );
}
