# 모델 어댑터

> v0.1 — 2026-05-16 — Draft

## 어댑터 인터페이스

```ts
// packages/adapters/src/index.ts
export interface ModelAdapter {
  id: ModelId;
  buildRequest(ir: RenderIR, apiKey: string): unknown;
  call(req: unknown, signal: AbortSignal): Promise<ImageRef>;
  classifyError(err: unknown): RenderError;
}

export type ModelId = 'gemini-3.1-flash-image-preview' | 'gpt-image-2' | 'mock';
export type RenderError = {
  category: 'transient' | 'auth' | 'quota' | 'safety' | 'invalid' | 'timeout';
  message: string;
  rawResponse?: unknown;
};
```

## MockAdapter (M1)

```ts
export const MockAdapter: ModelAdapter = {
  id: 'mock',
  buildRequest: () => ({}),
  call: async (_, signal) => {
    await sleep(2000, signal);
    return { storageKey: 'mock/black-square.png', width: 512, height: 512, mimeType: 'image/png' };
  },
  classifyError: () => ({ category: 'transient', message: 'mock' }),
};
```

## Gemini Adapter (M3)

### 파라미터 매핑

- 모델: `gemini-3.1-flash-image-preview`.
- 엔드포인트: Google Generative Language API `generateContent`.
- 멀티모달: `contents[].parts[]` 에 image/text 혼합.

### buildRequest 의사 코드

```ts
buildRequest(ir, apiKey) {
  const parts: Part[] = [];
  // 1. 스타일 ref
  for (const s of ir.styles) for (const img of s.images) parts.push(toInlineImage(img));
  // 2. 캐릭터 ref (각 캐릭터당 시스템 설명 + 이미지)
  for (const c of ir.characters) {
    parts.push({ text: `[캐릭터: ${c.name} — ${c.description}]` });
    for (const img of c.images) parts.push(toInlineImage(img));
  }
  // 3. 배경
  for (const b of ir.backgrounds) {
    parts.push({ text: `[배경: ${b.name} — ${b.description}]` });
    for (const img of b.images) parts.push(toInlineImage(img));
  }
  // 4. 세계관 텍스트
  for (const w of ir.worldviews) parts.push({ text: `[세계관] ${w.description}` });
  // 5. 콘티 + 유저 이미지
  if (ir.contiSketch) parts.push(toInlineImage(ir.contiSketch));
  for (const img of ir.userImages) parts.push(toInlineImage(img));
  // 6. 최종 지시
  parts.push({ text: `위 레퍼런스의 그림체·캐릭터·배경 일관성을 유지하라.\n${ir.userPrompt}` });

  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'image/png',
        aspectRatio: ir.aspectRatio,
      },
    },
  };
}
```

### 에러 분류

| 모델 응답                          | 카테고리    |
| ---------------------------------- | ----------- |
| HTTP 401 / 403                     | `auth`      |
| HTTP 429 / quota error             | `quota`     |
| HTTP 5xx, ECONNRESET               | `transient` |
| `SAFETY` / `BLOCKED_REASON_*`      | `safety`    |
| `INVALID_ARGUMENT` (잘못된 이미지) | `invalid`   |
| AbortError                         | `timeout`   |

## OpenAI Adapter (M3 후반)

### 파라미터 매핑

- 모델: `gpt-image-2`.
- 엔드포인트: `/v1/images/generations` (또는 `/edits` for image-conditioned).
- 멀티 이미지: `image[]` 배열.

### 주의

- 최대 reference 이미지 수 제한 있음 → 우선순위 잘라내기 (style → character → background → conti).
- 텍스트는 단일 `prompt` 문자열로 직렬화 필요 (Gemini처럼 멀티파트 불가능한 경우 대비).

## 우선순위 자르기 알고리즘

```ts
function selectReferences(ir, maxImages) {
  const buckets = [
    ir.styles.flatMap((s) => s.images),
    ir.characters.flatMap((c) => c.images),
    ir.backgrounds.flatMap((b) => b.images),
    ir.contiSketch ? [ir.contiSketch] : [],
    ir.userImages,
  ];
  const result = [];
  for (const bucket of buckets) {
    for (const img of bucket) {
      if (result.length >= maxImages) return result;
      result.push(img);
    }
  }
  return result;
}
```

## 어댑터 테스트 전략

- 단위: `buildRequest`의 결과 페이로드 스냅샷 테스트.
- 계약: MSW로 모델사 응답 모킹 → 에러 분류기 검증.
- 통합: BYOK 키 환경변수로 실제 호출 (CI에서는 skip).

## 변경 이력

- 2026-05-16: 초기 작성
