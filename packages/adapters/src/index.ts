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
  'gemini-3.1-flash-image-preview': GeminiAdapter,
  'gpt-image-2': OpenAIAdapter,
};

export function getAdapter(model: ModelId): ModelAdapter {
  // `Record<ModelId, …>` 라 타입상으로는 항상 있지만, 실제 인자는 DB 의 문자열을
  // `as ModelId` 로 캐스트해 온 것이다. 모델을 이름만 바꾸고 옛 행이 남아 있으면
  // 여기서 undefined 가 나온다 — 아래 throw 가 그걸 읽을 수 있는 오류로 바꾼다.
  const a = REGISTRY[model] as ModelAdapter | undefined;
  if (!a) throw new Error(`unknown model: ${model}`);
  return a;
}

export function availableModels(): ModelId[] {
  return Object.keys(REGISTRY) as ModelId[];
}
