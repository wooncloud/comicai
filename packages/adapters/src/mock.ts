import type { AdapterImage, RenderError } from '@comicai/types';
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

// 1x1 검은 PNG. 워커에서 storage 업로드 테스트용.
const BLACK_PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

export const MockAdapter: ModelAdapter = {
  id: 'mock',
  buildRequest: () => ({}),
  async call(_req, signal, _ctx): Promise<AdapterImage> {
    await sleep(Number(process.env.MOCK_RENDER_MS ?? 2000), signal);
    return { bytes: BLACK_PNG_1x1, width: 1, height: 1, mimeType: 'image/png' };
  },
  classifyError(err): RenderError {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { category: 'timeout', message: 'mock aborted' };
    }
    return { category: 'transient', message: 'mock failure' };
  },
};
