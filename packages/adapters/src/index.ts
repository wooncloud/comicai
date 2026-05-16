import type { AdapterImage, ModelId, RenderError, RenderIR } from '@comicai/types';

export interface AdapterContext {
  /** 어댑터가 storageKey를 실제 바이트로 로드. 워커가 StorageService 기반으로 주입. */
  loadReference: (storageKey: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
}

export interface ModelAdapter {
  id: ModelId;
  buildRequest(ir: RenderIR, apiKey: string): unknown;
  call(req: unknown, signal: AbortSignal, ctx: AdapterContext): Promise<AdapterImage>;
  classifyError(err: unknown): RenderError;
}

export { MockAdapter } from './mock';
export { GeminiAdapter } from './gemini';
export { OpenAIAdapter } from './openai';
export { selectReferences } from './priority';

import { MockAdapter } from './mock';
import { GeminiAdapter } from './gemini';
import { OpenAIAdapter } from './openai';

const REGISTRY: Record<ModelId, ModelAdapter> = {
  mock: MockAdapter,
  'gemini-nano-banana': GeminiAdapter,
  'gpt-image-1': OpenAIAdapter,
};

export function getAdapter(model: ModelId): ModelAdapter {
  const a = REGISTRY[model];
  if (!a) throw new Error(`unknown model: ${model}`);
  return a;
}

export function availableModels(): ModelId[] {
  return Object.keys(REGISTRY) as ModelId[];
}
