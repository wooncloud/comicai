import type { AdapterImage, RenderError, RenderIR } from '@comicai/types';
import type { AdapterContext, ModelAdapter } from './index';
import { selectReferences } from './priority';

const OPENAI_GEN_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_EDIT_URL = 'https://api.openai.com/v1/images/edits';
const OPENAI_MODEL = 'gpt-image-2';
const MAX_REF_IMAGES = 4; // gpt-image-2 보수적 상한

interface OpenAIRequest {
  apiKey: string;
  prompt: string;
  size: string;
  referenceKeys: string[];
}

class OpenAIHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public raw?: unknown,
  ) {
    super(message);
  }
}

export const OpenAIAdapter: ModelAdapter = {
  id: OPENAI_MODEL,

  buildRequest(ir: RenderIR, apiKey: string): OpenAIRequest {
    const refs = selectReferences(ir, MAX_REF_IMAGES);
    return {
      apiKey,
      prompt: buildPrompt(ir),
      size: aspectToSize(ir.aspectRatio),
      referenceKeys: refs.map((r) => r.storageKey),
    };
  },

  async call(rawReq: unknown, signal: AbortSignal, ctx: AdapterContext): Promise<AdapterImage> {
    const req = rawReq as OpenAIRequest;
    // 참조 이미지가 있으면 /v1/images/edits (multipart, image[]) 사용,
    // 없으면 /v1/images/generations.
    if (req.referenceKeys.length > 0) {
      const refs = await Promise.all(
        req.referenceKeys.map(async (key) => ({ key, ...(await ctx.loadReference(key)) })),
      );
      const form = new FormData();
      form.append('model', OPENAI_MODEL);
      form.append('prompt', req.prompt);
      form.append('size', req.size);
      form.append('n', '1');
      for (const r of refs) {
        const blob = new Blob([Buffer.from(r.bytes)], { type: r.mimeType });
        form.append('image[]', blob, fileName(r.key, r.mimeType));
      }
      const res = await fetch(OPENAI_EDIT_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${req.apiKey}` },
        body: form,
        signal,
      });
      return parseOpenAIImageResponse(res);
    }

    const res = await fetch(OPENAI_GEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${req.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: OPENAI_MODEL, prompt: req.prompt, n: 1, size: req.size }),
      signal,
    });
    return parseOpenAIImageResponse(res);
  },

  classifyError(err: unknown): RenderError {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { category: 'timeout', message: 'openai aborted' };
    }
    if (err instanceof OpenAIHttpError) {
      if (err.status === 401 || err.status === 403)
        return { category: 'auth', message: err.message };
      if (err.status === 429) return { category: 'quota', message: err.message };
      if (err.status >= 500) return { category: 'transient', message: err.message };
      if (err.status === 400) {
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

async function parseOpenAIImageResponse(res: Response): Promise<AdapterImage> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenAIHttpError(res.status, `openai http ${res.status}`, text);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new OpenAIHttpError(200, 'no image in response', json);
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  return { bytes, width: 0, height: 0, mimeType: 'image/png' };
}

function buildPrompt(ir: RenderIR): string {
  const lines: string[] = [];
  for (const s of ir.styles) lines.push(`그림체 ${s.name}: ${s.description}`);
  for (const c of ir.characters) lines.push(`캐릭터 ${c.name}: ${c.description}`);
  for (const b of ir.backgrounds) lines.push(`배경 ${b.name}: ${b.description}`);
  for (const w of ir.worldviews) lines.push(`세계관: ${w.description}`);
  if (ir.outputMode === 'entity') {
    if (ir.systemPrompt) lines.push(ir.systemPrompt);
    lines.push(
      `비율 ${ir.aspectRatio} (${ir.panelSize.w}×${ir.panelSize.h}px). 구도는 이 비율에서 잘리지 않게 잡을 것.`,
    );
  } else {
    lines.push(
      `이 출력은 만화 한 컷(single panel)이다. 여러 컷·격자·필름 스트립·페이지 레이아웃으로 분할하지 말고 하나의 장면만 한 프레임에 그릴 것.`,
    );
    lines.push(
      `패널 비율 ${ir.aspectRatio} (${ir.panelSize.w}×${ir.panelSize.h}px). 구도는 이 비율에서 잘리지 않게 잡을 것.`,
    );
  }
  if (ir.seed != null) lines.push(`seed=${ir.seed}`);
  lines.push(ir.userPrompt);
  return lines.join('\n');
}

function aspectToSize(aspect: string): string {
  // gpt-image-2 허용 사이즈: 1024x1024, 1024x1536, 1536x1024.
  const parts = aspect.split(':').map((x) => Number(x) || 1);
  const w = parts[0] ?? 1;
  const h = parts[1] ?? 1;
  if (w === h) return '1024x1024';
  return w > h ? '1536x1024' : '1024x1536';
}

function fileName(storageKey: string, mimeType: string): string {
  const base = storageKey.split('/').pop() ?? 'ref';
  if (/\.(png|jpe?g|webp)$/i.test(base)) return base;
  if (mimeType === 'image/png') return `${base}.png`;
  if (mimeType === 'image/webp') return `${base}.webp`;
  return `${base}.jpg`;
}
