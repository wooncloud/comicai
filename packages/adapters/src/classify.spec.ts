import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderIR } from '@comicai/types';
import { GeminiAdapter } from './gemini';
import { OpenAIAdapter } from './openai';
import type { AdapterContext } from './index';

/**
 * 분류를 고정한다. 여기가 틀리면 **돈이 샌다**: retryLimitFor 는 'transient' 에만 3 을
 * 주므로, 통과할 수 없는 요청이 transient 로 분류되면 세 번 호출되고 세 번 과금된다.
 *
 * 특히 Gemini 는 결과 이미지가 정책에 걸릴 때 HTTP 200 에 finishReason 만 담아 준다 —
 * 상태 코드만 보는 분류기에는 "그냥 이미지가 없는 응답" 으로 보인다.
 */
const IR: RenderIR = {
  panelId: 'p1',
  projectId: 'prj1',
  styles: [],
  characters: [],
  backgrounds: [],
  worldviews: [],
  contiSketch: null,
  userImages: [],
  userPrompt: '교실',
  aspectRatio: '1:1',
  panelSize: { w: 1024, h: 1024 },
  outputMode: 'panel',
} as unknown as RenderIR;

const CTX: AdapterContext = {
  loadReference: () => Promise.resolve({ bytes: new Uint8Array(), mimeType: 'image/png' }),
};

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

/** 어댑터가 던진 예외를 그대로 잡아 분류기에 넘긴다 — 예외 타입은 모듈 밖으로 안 나온다. */
async function categoryOf(
  adapter: typeof GeminiAdapter,
  req: unknown,
): Promise<string | undefined> {
  try {
    await adapter.call(req, new AbortController().signal, CTX);
  } catch (err) {
    return adapter.classifyError(err).category;
  }
  return undefined;
}

afterEach(() => vi.unstubAllGlobals());

describe('Gemini 응답 분류', () => {
  const req = () => GeminiAdapter.buildRequest(IR, 'k');

  it.each(['IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'RECITATION'])(
    'finishReason %s 는 safety — 재시도하지 않는다',
    async (reason) => {
      respondWith({ candidates: [{ finishReason: reason, content: { parts: [] } }] });
      await expect(categoryOf(GeminiAdapter, req())).resolves.toBe('safety');
    },
  );

  it('promptFeedback.blockReason 도 safety', async () => {
    respondWith({ promptFeedback: { blockReason: 'SAFETY' } });
    await expect(categoryOf(GeminiAdapter, req())).resolves.toBe('safety');
  });

  it('이유 없이 이미지만 없으면 invalid — transient 로 새면 3번 과금된다', async () => {
    respondWith({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '…' }] } }] });
    await expect(categoryOf(GeminiAdapter, req())).resolves.toBe('invalid');
  });

  it('5xx 는 여전히 transient — 이건 재시도가 맞다', async () => {
    respondWith({}, 503);
    await expect(categoryOf(GeminiAdapter, req())).resolves.toBe('transient');
  });

  it('401 은 auth', async () => {
    respondWith({}, 401);
    await expect(categoryOf(GeminiAdapter, req())).resolves.toBe('auth');
  });
});

describe('OpenAI 응답 분류', () => {
  const req = () => OpenAIAdapter.buildRequest(IR, 'k');

  it('200 인데 이미지가 없으면 invalid', async () => {
    respondWith({ data: [] });
    await expect(categoryOf(OpenAIAdapter, req())).resolves.toBe('invalid');
  });

  it('5xx 는 transient', async () => {
    respondWith({}, 502);
    await expect(categoryOf(OpenAIAdapter, req())).resolves.toBe('transient');
  });

  it('400 + content_policy 는 safety — 두 어댑터가 분류기를 공유해도 이 판정은 서로 다르다', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response('{"error":{"code":"content_policy_violation"}}', { status: 400 }),
      ),
    );
    await expect(categoryOf(OpenAIAdapter, req())).resolves.toBe('safety');
  });

  it('그냥 400 은 invalid', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{"error":{}}', { status: 400 })));
    await expect(categoryOf(OpenAIAdapter, req())).resolves.toBe('invalid');
  });

  it('401 은 auth', async () => {
    respondWith({}, 401);
    await expect(categoryOf(OpenAIAdapter, req())).resolves.toBe('auth');
  });
});
