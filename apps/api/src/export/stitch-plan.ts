/**
 * 이어 붙일 페이지를 **파일 단위로 묶는다.**
 *
 * 웹툰 한 화는 끊김 없이 흐르는 한 덩어리지만, 한 파일이 수만 픽셀이면 올리는 쪽도
 * 보는 쪽도 감당하지 못한다. 그래서 상한을 넘으면 나누되 **페이지 경계에서만** 끊는다 —
 * 그림 한가운데를 자르는 것보다 파일이 하나 느는 편이 낫다.
 *
 * 순수 함수로 떼어 둔 이유: 실제 이어 붙이기는 sharp 와 S3 를 거쳐 테스트가 무겁다.
 * 정작 틀리기 쉬운 것은 "언제 끊는가" 하나뿐이라 그것만 따로 묶는다.
 *
 * @param heights 페이지 높이들. 순서가 곧 읽는 순서다.
 * @returns 각 파일에 들어갈 페이지 인덱스 묶음.
 */
export function planStitchSegments(heights: readonly number[], max: number): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  let height = 0;

  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i]!;
    // 한 장이 이미 상한보다 길면 그 한 장이 통째로 한 파일이 된다 — 자르지 않는다.
    if (current.length > 0 && height + h > max) {
      out.push(current);
      current = [];
      height = 0;
    }
    current.push(i);
    height += h;
  }
  if (current.length > 0) out.push(current);
  return out;
}
