import type { ImageRef, RenderIR } from '@comicai/types';

/**
 * 한 요청에 실어 보낼 참조 이미지 상한.
 *
 * 예전에는 어댑터마다 각각 있었고 `openai.ts` 주석이 *"Gemini 와 동일하게 16 으로 통일"*
 * 이라고 적혀 있었다 — 손으로 맞춰야 한다는 자백이다. 두 어댑터가 같은 값을 쓰므로
 * `selectReferences` 도 상한을 인자로 받지 않는다. 프로바이더별로 갈라야 할 날이 오면
 * 그때 인자를 되살리는 편이, 지금 안 쓰는 인자를 들고 다니는 것보다 낫다.
 */
export const MAX_REF_IMAGES = 16;

/**
 * 참조 이미지를 상한에 맞춰 우선순위대로 자른다.
 * 우선순위: style > character > background > conti > userImages.
 */
export function selectReferences(ir: RenderIR, maxImages: number = MAX_REF_IMAGES): ImageRef[] {
  const buckets: ImageRef[][] = [
    ir.styles.flatMap((s) => s.images),
    ir.characters.flatMap((c) => c.images),
    ir.backgrounds.flatMap((b) => b.images),
    ir.contiSketch ? [ir.contiSketch] : [],
    ir.userImages,
  ];
  const out: ImageRef[] = [];
  for (const bucket of buckets) {
    for (const img of bucket) {
      if (out.length >= maxImages) return out;
      out.push(img);
    }
  }
  return out;
}
