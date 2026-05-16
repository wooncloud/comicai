import type { AdapterImage, ImageRef, RenderError, RenderIR } from '@comicai/types';
import type { ModelAdapter } from './index';
import { selectReferences } from './priority';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';
const MAX_REF_IMAGES = 16;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    contents: { role: string; parts: GeminiPart[] }[];
    generationConfig: { responseMimeType: string };
  };
}

class GeminiHttpError extends Error {
  constructor(public status: number, message: string, public raw?: unknown) {
    super(message);
  }
}

export const GeminiAdapter: ModelAdapter = {
  id: 'gemini-nano-banana',

  buildRequest(ir: RenderIR, apiKey: string): GeminiRequest {
    const parts: GeminiPart[] = [];
    const refs = selectReferences(ir, MAX_REF_IMAGES);

    for (const s of ir.styles) {
      parts.push({ text: `[그림체: ${s.name} — ${s.description}]` });
    }
    for (const c of ir.characters) {
      parts.push({ text: `[캐릭터: ${c.name} — ${c.description}]` });
    }
    for (const b of ir.backgrounds) {
      parts.push({ text: `[배경: ${b.name} — ${b.description}]` });
    }
    for (const w of ir.worldviews) {
      parts.push({ text: `[세계관] ${w.description}` });
    }
    for (const img of refs) {
      parts.push(toInlinePart(img));
    }
    parts.push({
      text: `위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.\n종횡비: ${ir.aspectRatio}\n${ir.userPrompt}`,
    });

    return {
      url: GEMINI_URL,
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'image/png' },
      },
    };
  },

  async call(rawReq: unknown, signal: AbortSignal): Promise<AdapterImage> {
    const req = rawReq as GeminiRequest;
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GeminiHttpError(res.status, `gemini http ${res.status}`, text);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) {
      throw new GeminiHttpError(200, `SAFETY: ${json.promptFeedback.blockReason}`, json);
    }
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) {
      throw new GeminiHttpError(200, 'no image in response', json);
    }
    const bytes = Uint8Array.from(Buffer.from(part.inlineData.data, 'base64'));
    return { bytes, width: 0, height: 0, mimeType: part.inlineData.mimeType };
  },

  classifyError(err: unknown): RenderError {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { category: 'timeout', message: 'gemini aborted' };
    }
    if (err instanceof GeminiHttpError) {
      const m = err.message;
      if (m.startsWith('SAFETY')) return { category: 'safety', message: m, rawResponse: err.raw };
      if (err.status === 401 || err.status === 403) return { category: 'auth', message: m };
      if (err.status === 429) return { category: 'quota', message: m };
      if (err.status >= 500) return { category: 'transient', message: m };
      if (err.status === 400) return { category: 'invalid', message: m, rawResponse: err.raw };
      return { category: 'transient', message: m };
    }
    if ((err as { code?: string })?.code === 'ECONNRESET') {
      return { category: 'transient', message: 'connection reset' };
    }
    return { category: 'transient', message: (err as Error)?.message ?? 'unknown' };
  },
};

function toInlinePart(img: ImageRef): GeminiPart {
  // 실제 byte를 갖고 있지 않으면 외부 URI로 직접 전달이 안 됨.
  // 워커에서 storage.get(img.storageKey)로 받아 base64로 변환하는 단계가 필요.
  // 본 어댑터는 storageKey 문자열을 placeholder로 둠 — 워커가 호출 직전 치환.
  return { inlineData: { mimeType: img.mimeType, data: `__STORAGE__${img.storageKey}` } };
}
