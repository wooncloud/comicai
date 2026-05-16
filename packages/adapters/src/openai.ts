// M3 진입 전 stub.
import type { ImageRef, RenderError } from '@comicai/types';
import type { ModelAdapter } from './index';

export const OpenAIAdapter: ModelAdapter = {
  id: 'gpt-image-1',
  buildRequest() {
    throw new Error('OpenAIAdapter not implemented yet (M3)');
  },
  async call(): Promise<ImageRef> {
    throw new Error('OpenAIAdapter not implemented yet (M3)');
  },
  classifyError(): RenderError {
    return { category: 'invalid', message: 'not implemented' };
  },
};
