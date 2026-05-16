'use client';
import { useState } from 'react';
import type { ModelProvider } from '@comicai/types';

interface Props {
  onSubmit: (provider: ModelProvider, label: string, secret: string) => Promise<void>;
}

export function ApiKeyForm({ onSubmit }: Props) {
  const [provider, setProvider] = useState<ModelProvider>('gemini');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSubmit(provider, label, secret);
      setLabel('');
      setSecret('');
    } catch {
      setError('등록에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex gap-3">
        <label className="block flex-1">
          <span className="text-xs text-neutral-600">제공자</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ModelProvider)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="block flex-1">
          <span className="text-xs text-neutral-600">라벨</span>
          <input
            type="text"
            required
            value={label}
            maxLength={80}
            placeholder="예: 개인 Gemini"
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-neutral-600">API 키</span>
        <input
          type="password"
          required
          minLength={8}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? '등록 중…' : '등록'}
      </button>
    </form>
  );
}
