import type { AdapterImage, ImageRef, RenderError, RenderIR } from '@comicai/types';
import type { AdapterContext, ModelAdapter } from './index';
import { selectReferences } from './priority';

const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_REF_IMAGES = 16;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  /** 빌드 단계에서는 storageKey를 placeholder로 보관, call 단계에서 실제 base64로 교체. */
  __storageKey?: string;
}

interface GeminiRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    contents: { role: string; parts: GeminiPart[] }[];
    generationConfig: {
      responseModalities: string[];
      imageConfig?: { aspectRatio?: string };
    };
  };
}

class GeminiHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public raw?: unknown,
  ) {
    super(message);
  }
}

export const GeminiAdapter: ModelAdapter = {
  id: 'gemini-nano-banana',

  buildRequest(ir: RenderIR, apiKey: string): GeminiRequest {
    const parts: GeminiPart[] = [];
    const refs = selectReferences(ir, MAX_REF_IMAGES);

    for (const s of ir.styles) parts.push({ text: `[그림체: ${s.name} — ${s.description}]` });
    for (const c of ir.characters) parts.push({ text: `[캐릭터: ${c.name} — ${c.description}]` });
    for (const b of ir.backgrounds) parts.push({ text: `[배경: ${b.name} — ${b.description}]` });
    for (const w of ir.worldviews) parts.push({ text: `[세계관] ${w.description}` });
    for (const img of refs) parts.push(toRefPart(img));
    parts.push({
      text:
        `위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.\n` +
        `최종 출력은 패널 비율 ${ir.aspectRatio}(${ir.panelSize.w}×${ir.panelSize.h}px)에 정확히 맞춰 잘림 없이 구도를 잡을 것.\n` +
        `${ir.userPrompt}${ir.seed != null ? `\nseed=${ir.seed}` : ''}`,
    });

    return {
      url: GEMINI_URL,
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts }],
        // 이미지 생성 모델은 responseModalities를 요구. responseMimeType은 400을 유발.
        // imageConfig.aspectRatio로 패널 비율을 모델에 직접 전달(지원 시 자동 적용).
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: ir.aspectRatio },
        },
      },
    };
  },

  async call(rawReq: unknown, signal: AbortSignal, ctx: AdapterContext): Promise<AdapterImage> {
    const req = rawReq as GeminiRequest;
    const firstContent = req.body.contents[0];
    if (!firstContent) throw new GeminiHttpError(0, 'empty contents');
    const resolved = await Promise.all(
      firstContent.parts.map(async (p) => {
        if (p.__storageKey) {
          const { bytes, mimeType } = await ctx.loadReference(p.__storageKey);
          return {
            inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') },
          } satisfies GeminiPart;
        }
        return p;
      }),
    );
    const body = {
      contents: [{ role: 'user', parts: resolved }],
      generationConfig: req.body.generationConfig,
    };
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GeminiHttpError(res.status, `gemini http ${res.status}`, text);
    }
    const json = (await res.json()) as {
      candidates?: {
        content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] };
      }[];
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

function toRefPart(img: ImageRef): GeminiPart {
  return { __storageKey: img.storageKey };
}
