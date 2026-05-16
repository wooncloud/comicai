import type { ImageRef, ModelId, RenderError, RenderIR } from '@comicai/types';

export interface ModelAdapter {
  id: ModelId;
  buildRequest(ir: RenderIR, apiKey: string): unknown;
  call(req: unknown, signal: AbortSignal): Promise<ImageRef>;
  classifyError(err: unknown): RenderError;
}

export { MockAdapter } from './mock';
export { GeminiAdapter } from './gemini';
export { OpenAIAdapter } from './openai';
export { selectReferences } from './priority';

import type { ModelAdapter as _MA } from './_alias';
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
