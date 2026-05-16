'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ApiKeySummary, ModelProvider } from '@comicai/types';
import { ApiKeyList } from '@/components/api-key-list';
import { ApiKeyForm } from '@/components/api-key-form';
import { AppShell } from '@/components/shell/app-shell';

export default function SettingsPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api<ApiKeySummary[]>('/api-keys');
      setKeys(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError('API 키 목록을 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(provider: ModelProvider, label: string, secret: string) {
    await api('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ provider, label, secret }),
    });
    await refresh();
  }

  async function onDelete(id: string) {
    await api(`/api-keys/${id}`, { method: 'DELETE' });
    await refresh();
  }

  async function onLogout() {
    await api('/auth/logout', { method: 'POST' });
    router.push('/');
  }

  return (
    <AppShell>
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">설정</h1>
        <button
          onClick={onLogout}
          className="text-sm text-neutral-600 underline hover:text-neutral-900"
        >
          로그아웃
        </button>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-medium">API 키 (BYOK)</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Gemini 또는 OpenAI API 키를 등록합니다. 키는 AES-256-GCM으로 암호화되어 저장됩니다.
        </p>

        <div className="mt-6 space-y-8">
          <ApiKeyForm onSubmit={onCreate} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {keys && <ApiKeyList items={keys} onDelete={onDelete} />}
        </div>
      </section>
    </main>
    </AppShell>
  );
}
