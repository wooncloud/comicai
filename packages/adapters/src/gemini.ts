// M3 진입 전 stub. 실 구현은 packages/adapters/src/gemini.ts.
import type { ImageRef, RenderError } from '@comicai/types';
import type { ModelAdapter } from './index';

export const GeminiAdapter: ModelAdapter = {
  id: 'gemini-nano-banana',
  buildRequest() {
    throw new Error('GeminiAdapter not implemented yet (M3)');
  },
  async call(): Promise<ImageRef> {
    throw new Error('GeminiAdapter not implemented yet (M3)');
  },
  classifyError(): RenderError {
    return { category: 'invalid', message: 'not implemented' };
  },
};
