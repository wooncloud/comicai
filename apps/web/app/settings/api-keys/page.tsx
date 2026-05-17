'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type ApiKeySummary, type ModelProvider } from '@comicai/types';
import { ApiKeyList } from '@/components/api-key-list';
import { ApiKeyForm } from '@/components/api-key-form';

export default function ApiKeysSettingsPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api<ApiKeySummary[]>(ApiPaths.apiKeys);
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
    void refresh();
  }, []);

  async function onCreate(provider: ModelProvider, label: string, key: string) {
    await api(ApiPaths.apiKeys, {
      method: 'POST',
      body: JSON.stringify({ provider, label, key }),
    });
    await refresh();
  }

  async function onDelete(id: string) {
    await api(ApiPaths.apiKey(id), { method: 'DELETE' });
    await refresh();
  }

  async function onVerify(id: string) {
    await api(ApiPaths.apiKeyVerify(id), { method: 'POST' });
    await refresh();
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-title-lg font-semibold">API 키 (BYOK)</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Gemini 또는 OpenAI API 키를 등록합니다. 키는 AES-256-GCM으로 암호화되어 저장됩니다.
        </p>
      </header>
      <div className="space-y-6">
        <ApiKeyForm onSubmit={onCreate} />
        {error && <p className="text-body-sm text-destructive">{error}</p>}
        {keys && <ApiKeyList items={keys} onDelete={onDelete} onVerify={onVerify} />}
      </div>
    </section>
  );
}
