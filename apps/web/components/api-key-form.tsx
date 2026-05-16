'use client';
import { useState } from 'react';
import type { ModelProvider } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  onSubmit: (provider: ModelProvider, label: string, apiKey: string) => Promise<void>;
}

export function ApiKeyForm({ onSubmit }: Props) {
  const [provider, setProvider] = useState<ModelProvider>('gemini');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSubmit(provider, label, apiKey);
      setLabel('');
      setApiKey('');
    } catch {
      setError('등록에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4 rounded-md border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">제공자</label>
          <Select value={provider} onValueChange={(v) => setProvider(v as ModelProvider)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">라벨</label>
          <Input
            required
            value={label}
            maxLength={80}
            placeholder="예: 개인 Gemini"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">API 키</label>
        <Input
          type="password"
          required
          minLength={8}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          className="font-mono"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? '등록 중…' : '등록'}
      </Button>
    </form>
  );
}
