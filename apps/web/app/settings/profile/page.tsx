'use client';
import { useEffect, useRef, useState } from 'react';
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
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 사용자가 URL 입력을 직접 건드렸을 때만 PATCH에 avatarUrl 포함.
  // (업로드된 아바타의 presigned URL이 다시 PATCH로 흘러 들어가 storageKey가 지워지는 것을 방지)
  const [urlDirty, setUrlDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
          ...(urlDirty ? { avatarUrl: avatarUrl || null } : {}),
        }),
      });
      setMe(updated);
      setAvatarUrl(updated.avatarUrl ?? '');
      setUrlDirty(false);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) setError(`저장 실패: ${err.code}`);
      else setError('저장에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setSuccess(false);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api<SessionUser>(ApiPaths.meAvatar, {
        method: 'POST',
        body: fd,
      });
      setMe(updated);
      setAvatarUrl(updated.avatarUrl ?? '');
      setUrlDirty(false);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) setError(`업로드 실패: ${err.code}`);
      else setError('업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  }

  async function onRemoveAvatar() {
    setError(null);
    setSuccess(false);
    setUploading(true);
    try {
      const updated = await api<SessionUser>(ApiPaths.meAvatar, { method: 'DELETE' });
      setMe(updated);
      setAvatarUrl('');
      setUrlDirty(false);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) setError(`삭제 실패: ${err.code}`);
      else setError('삭제에 실패했습니다.');
    } finally {
      setUploading(false);
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
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <label className="block text-caption text-muted-foreground">아바타 이미지 업로드</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onFile}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? '업로드 중…' : '파일 선택'}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={onRemoveAvatar}
                >
                  제거
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-caption text-muted-foreground">또는 아바타 URL</label>
            <Input
              type="url"
              placeholder="https://…"
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setUrlDirty(true);
              }}
            />
          </div>
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
