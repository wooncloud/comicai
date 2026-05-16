import type { ImageRef, RenderIR } from '@comicai/types';

/**
 * 어댑터별 reference 이미지 상한이 있을 때 우선순위에 따라 자른다.
 * 우선순위: style > character > background > conti > userImages.
 */
export function selectReferences(ir: RenderIR, maxImages: number): ImageRef[] {
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
