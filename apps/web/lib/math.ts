/** `n` 을 [min, max] 로 묶는다. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
