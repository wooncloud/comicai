'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ApiPaths, type ApiKeySummary, type ModelProvider } from '@comicai/types';
import { ApiKeyList } from '@/components/api-key-list';
import { ApiKeyForm } from '@/components/api-key-form';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/error-message';
import { FEATURES } from '@/lib/features';

export default function ApiKeysSettingsPage() {
  // 탭에서 링크를 빼도 주소를 직접 치면 들어와진다. 라우트에서도 막는다.
  // (서버 API 는 별도로 404 를 던지므로, 여기가 뚫려도 데이터는 나가지 않는다.)
  if (!FEATURES.apiKeys) notFound();

  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function refresh() {
    try {
      const list = await api<ApiKeySummary[]>(ApiPaths.apiKeys);
      setKeys(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(errorMessage(err, 'API 키 목록을 불러오지'));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(provider: ModelProvider, label: string, key: string) {
    try {
      await api(ApiPaths.apiKeys, {
        method: 'POST',
        body: JSON.stringify({ provider, label, key }),
      });
      await refresh();
      toast.push('success', 'API 키가 등록되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '키를 등록'));
      throw err;
    }
  }

  async function onDelete(id: string) {
    try {
      await api(ApiPaths.apiKey(id), { method: 'DELETE' });
      await refresh();
      toast.push('success', 'API 키가 삭제되었습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '키를 삭제'));
    }
  }

  async function onVerify(id: string) {
    try {
      await api(ApiPaths.apiKeyVerify(id), { method: 'POST' });
      await refresh();
      toast.push('success', 'API 키 검증을 완료했습니다.');
    } catch (err) {
      toast.push('error', errorMessage(err, '키를 검증'));
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-title-lg font-semibold">API 키</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Gemini 또는 OpenAI API 키를 등록합니다. 키는 서버에 안전하게 암호화되어 저장됩니다.
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
