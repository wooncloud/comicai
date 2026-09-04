import { isHexColor } from '@comicai/types';

export function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * hex 가 아닌 색은 폴백으로 바꾼다.
 *
 * **읽는 쪽에서도 흡수해야 한다.** 새 입력은 Zod 가 막지만(`ColorStringSchema`),
 * 그 검증이 생기기 전에 저장된 행은 검증을 거치지 않았다. 예전에는 패널 외곽선만
 * 이 폴백을 갖고 있었고 말풍선·텍스트·직선은 저장된 문자열을 그대로 SVG 속성에
 * 넣었다 — 캔버스와 export 결과가 다르게 보이는데 어느 쪽도 오류를 내지 않는다.
 *
 * 돌려주는 값은 hex 아니면 폴백이라 별도 escape 가 필요 없다.
 */
export function safeColor(c: string | undefined | null, fallback: string): string {
  return c && isHexColor(c) ? c : fallback;
}

/** 페이지 크기 SVG 문서 한 장. 래퍼가 다섯 벌로 흩어져 있던 것을 여기로 모은다. */
export function svgDocument(width: number, height: number, body: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
    'utf8',
  );
}

/**
 * 페이지 오버레이 레이어 하나. 그릴 것이 없으면 `null` 이고, 호출부는 그때 합성에서 뺀다.
 *
 * 세 레이어(말풍선·텍스트·직선)가 "빈 배열이면 null → map → 빈 조각 제거 → join → Buffer"
 * 를 각자 적고 있었다.
 */
export function svgLayer<T>(
  items: readonly T[],
  build: (item: T) => string,
  width: number,
  height: number,
): Buffer | null {
  if (items.length === 0) return null;
  const body = items.map(build).filter(Boolean).join('\n');
  if (!body) return null;
  return svgDocument(width, height, body);
}
