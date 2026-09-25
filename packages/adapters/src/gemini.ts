import type { AdapterImage, ImageRef, RenderError, RenderIR } from '@comicai/types';
import type { AdapterContext, ModelAdapter } from './index';
import { selectReferences } from './priority';
import { classifyModelHttpError, ModelHttpError } from './http-error';

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
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

/**
 * 후보 단위 차단 사유. Gemini 는 **결과 이미지**가 정책에 걸리면 `promptFeedback.blockReason`
 * 을 비워 둔 채 candidate 의 `finishReason` 에만 이유를 넣고 200 을 준다. 이걸 읽지 않으면
 * "이미지 없음" 으로만 보여서 재시도 대상이 되고, 절대 통과 못 할 요청을 유료로 반복한다.
 */
/**
 * Gemini 의 `imageConfig.aspectRatio` 는 **고정된 목록만** 받는다. 반면 패널은 사람이 캔버스에
 * 그린 사각형이라 크기를 약분하면 `73:28` 같은 값이 나오고, 그대로 보내면 `400` 이다
 * (`aspect_ratio must be one of …`). 그러면 생성이 실패해 토큰이 환급되고, 사용자는
 * **아무 컷도 그릴 수 없다.** 그래서 가장 가까운 허용 비율로 붙여서 보낸다.
 *
 * 프롬프트 본문에는 실제 픽셀 크기를 그대로 적는다(`:67`) — 붙인 비율은 모델에 주는 힌트이고,
 * 정확한 구도는 문장이 책임진다.
 */
const GEMINI_ASPECT_RATIOS = [
  '1:8',
  '1:4',
  '9:16',
  '2:3',
  '3:4',
  '4:5',
  '1:1',
  '5:4',
  '4:3',
  '3:2',
  '16:9',
  '21:9',
  '4:1',
  '8:1',
] as const;

export function nearestGeminiAspectRatio(aspect: string): string {
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return '1:1';
  const target = w / h;
  let best: string = '1:1';
  let bestDistance = Infinity;
  for (const candidate of GEMINI_ASPECT_RATIOS) {
    const [cw, ch] = candidate.split(':').map(Number) as [number, number];
    // 로그 거리로 재야 가로가 긴 쪽과 세로가 긴 쪽이 대칭으로 다뤄진다 —
    // 선형 차이로 재면 21:9 같은 큰 값 쪽 간격이 과대평가된다.
    const distance = Math.abs(Math.log(target / (cw / ch)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'IMAGE_PROHIBITED_CONTENT',
  'RECITATION',
  'IMAGE_RECITATION',
  'BLOCKLIST',
  'SPII',
]);

export const GeminiAdapter: ModelAdapter = {
  id: 'gemini-3.1-flash-image-preview',

  buildRequest(ir: RenderIR, apiKey: string): GeminiRequest {
    const parts: GeminiPart[] = [];
    const refs = selectReferences(ir);

    for (const s of ir.styles) parts.push({ text: `[그림체: ${s.name} — ${s.description}]` });
    for (const c of ir.characters) parts.push({ text: `[캐릭터: ${c.name} — ${c.description}]` });
    for (const b of ir.backgrounds) parts.push({ text: `[배경: ${b.name} — ${b.description}]` });
    for (const w of ir.worldviews) parts.push({ text: `[세계관] ${w.description}` });
    for (const img of refs) parts.push(toRefPart(img));
    if (ir.outputMode === 'entity') {
      parts.push({
        text:
          `${ir.systemPrompt ?? ''}\n` +
          `최종 출력은 비율 ${ir.aspectRatio}(${ir.panelSize.w}×${ir.panelSize.h}px)에 맞출 것.\n` +
          `${ir.userPrompt}${ir.seed != null ? `\nseed=${ir.seed}` : ''}`,
      });
    } else {
      parts.push({
        text:
          `위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.\n` +
          `이 출력은 만화 한 컷(single panel)이다. 절대로 여러 컷·격자·말풍선 분할·필름 스트립·페이지 레이아웃으로 나누지 말고, 하나의 연속된 장면만 한 프레임 안에 그릴 것.\n` +
          `최종 출력은 패널 비율 ${ir.aspectRatio}(${ir.panelSize.w}×${ir.panelSize.h}px)에 정확히 맞춰 잘림 없이 구도를 잡을 것.\n` +
          `${ir.userPrompt}${ir.seed != null ? `\nseed=${ir.seed}` : ''}`,
      });
    }

    return {
      url: GEMINI_URL,
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts }],
        // 이미지 생성 모델은 responseModalities를 요구. responseMimeType은 400을 유발.
        // imageConfig.aspectRatio 는 허용 목록에만 있는 값이어야 한다 — 위 nearestGeminiAspectRatio 참고.
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: nearestGeminiAspectRatio(ir.aspectRatio) },
        },
      },
    };
  },

  async call(rawReq: unknown, signal: AbortSignal, ctx: AdapterContext): Promise<AdapterImage> {
    const req = rawReq as GeminiRequest;
    const firstContent = req.body.contents[0];
    if (!firstContent) throw new ModelHttpError(0, 'empty contents');
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
      throw new ModelHttpError(res.status, `gemini http ${res.status}`, text);
    }
    const json = (await res.json()) as {
      candidates?: {
        content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
    };
    // 프롬프트 자체가 막힌 경우.
    if (json.promptFeedback?.blockReason) {
      throw new ModelHttpError(200, `SAFETY: ${json.promptFeedback.blockReason}`, json);
    }
    const candidate = json.candidates?.[0];
    // 결과가 막힌 경우. blockReason 은 비어 있고 parts 에 inlineData 도 없다.
    const finishReason = candidate?.finishReason;
    if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
      throw new ModelHttpError(200, `SAFETY: ${finishReason}`, json);
    }
    const part = candidate?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) {
      const detail = finishReason ? ` (${finishReason})` : '';
      throw new ModelHttpError(200, `no image in response${detail}`, json);
    }
    const bytes = Uint8Array.from(Buffer.from(part.inlineData.data, 'base64'));
    return { bytes, width: 0, height: 0, mimeType: part.inlineData.mimeType };
  },

  classifyError(err: unknown): RenderError {
    return classifyModelHttpError(err, {
      timeoutMessage: 'gemini aborted',
      // Gemini 는 차단을 응답 본문으로 알린다(promptFeedback.blockReason / finishReason).
      // call() 이 그걸 `SAFETY:` 접두로 바꿔 던진다.
      isSafety: (e) => e.message.startsWith('SAFETY'),
    });
  },
};

function toRefPart(img: ImageRef): GeminiPart {
  return { __storageKey: img.storageKey };
}
