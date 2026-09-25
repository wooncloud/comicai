/**
 * 동시 실행 개수를 묶은 `Promise.all`. 결과 순서는 입력 순서 그대로다 —
 * 합성 순서가 곧 z-order 라 뒤섞이면 안 된다.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      const item = items[i];
      if (item === undefined) continue;
      out[i] = await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
