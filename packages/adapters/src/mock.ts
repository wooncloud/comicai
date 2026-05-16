import type { ImageRef, RenderError } from '@comicai/types';
import type { ModelAdapter } from './index';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

const MOCK_IMAGE: ImageRef = {
  storageKey: 'mock/black-square.png',
  width: 512,
  height: 512,
  mimeType: 'image/png',
};

export const MockAdapter: ModelAdapter = {
  id: 'mock',
  buildRequest: () => ({}),
  async call(_req, signal) {
    await sleep(Number(process.env.MOCK_RENDER_MS ?? 2000), signal);
    return MOCK_IMAGE;
  },
  classifyError(err): RenderError {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { category: 'timeout', message: 'mock aborted' };
    }
    return { category: 'transient', message: 'mock failure' };
  },
};
