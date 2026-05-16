import type { AdapterImage, RenderError, RenderIR } from '@comicai/types';
import type { ModelAdapter } from './index';
import { selectReferences } from './priority';

const OPENAI_GEN_URL = 'https://api.openai.com/v1/images/generations';
const MAX_REF_IMAGES = 4; // gpt-image-1 다중 참조 상한 (보수적)

interface OpenAIRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: 'gpt-image-1';
    prompt: string;
    n: 1;
    size: string;
    /** 우선순위 자르기 후 남은 참조 이미지 storageKey 목록. 워커에서 multipart 변환. */
    referenceKeys: string[];
  };
}

class OpenAIHttpError extends Error {
  constructor(public status: number, message: string, public raw?: unknown) {
    super(message);
  }
}

export const OpenAIAdapter: ModelAdapter = {
  id: 'gpt-image-1',

  buildRequest(ir: RenderIR, apiKey: string): OpenAIRequest {
    const refs = selectReferences(ir, MAX_REF_IMAGES);
    const prompt = buildPrompt(ir);
    const size = aspectToSize(ir.aspectRatio);
    return {
      url: OPENAI_GEN_URL,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: {
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size,
        referenceKeys: refs.map((r) => r.storageKey),
      },
    };
  },

  async call(rawReq: unknown, signal: AbortSignal): Promise<AdapterImage> {
    const req = rawReq as OpenAIRequest;
    // PoC: 단순 generations 호출. 참조 이미지 multipart는 워커가 처리.
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify({ model: req.body.model, prompt: req.body.prompt, n: req.body.n, size: req.body.size }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OpenAIHttpError(res.status, `openai http ${res.status}`, text);
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new OpenAIHttpError(200, 'no image in response', json);
    const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
    return { bytes, width: 0, height: 0, mimeType: 'image/png' };
  },

  classifyError(err: unknown): RenderError {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { category: 'timeout', message: 'openai aborted' };
    }
    if (err instanceof OpenAIHttpError) {
      if (err.status === 401 || err.status === 403) return { category: 'auth', message: err.message };
      if (err.status === 429) return { category: 'quota', message: err.message };
      if (err.status >= 500) return { category: 'transient', message: err.message };
      if (err.status === 400) {
        // safety policy violations come back as 400 content_policy_violation
        if (typeof err.raw === 'string' && err.raw.includes('content_policy')) {
          return { category: 'safety', message: err.message, rawResponse: err.raw };
        }
        return { category: 'invalid', message: err.message, rawResponse: err.raw };
      }
      return { category: 'transient', message: err.message };
    }
    return { category: 'transient', message: (err as Error)?.message ?? 'unknown' };
  },
};

function buildPrompt(ir: RenderIR): string {
  const lines: string[] = [];
  for (const s of ir.styles) lines.push(`그림체 ${s.name}: ${s.description}`);
  for (const c of ir.characters) lines.push(`캐릭터 ${c.name}: ${c.description}`);
  for (const b of ir.backgrounds) lines.push(`배경 ${b.name}: ${b.description}`);
  for (const w of ir.worldviews) lines.push(`세계관: ${w.description}`);
  lines.push(`종횡비 ${ir.aspectRatio}.`, ir.userPrompt);
  return lines.join('\n');
}

function aspectToSize(aspect: string): string {
  // gpt-image-1 허용 사이즈: 1024x1024, 1024x1536, 1536x1024 (보수적 매핑)
  const parts = aspect.split(':').map((x) => Number(x) || 1);
  const w = parts[0] ?? 1;
  const h = parts[1] ?? 1;
  if (w === h) return '1024x1024';
  return w > h ? '1536x1024' : '1024x1536';
}
