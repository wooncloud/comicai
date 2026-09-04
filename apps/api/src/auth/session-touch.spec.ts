import { describe, expect, it } from 'vitest';
import { shouldRefreshLastUsed } from './session.service';

/**
 * `read()` 는 인증된 **모든** 요청이 지나는 길이다. 예전에는 여기서 세션 JSON 전체를
 * 재직렬화해 SET 했다 — 인증된 읽기 하나마다 Redis 쓰기 하나. 그런데 바뀌는 값은
 * `lastUsedAt` 뿐이고, 그걸 읽는 곳은 `/me/sessions` 화면 하나다.
 *
 * 여기서 고정하는 것: 조용한 구간에서는 쓰지 않고, 값이 깨졌으면 반드시 쓴다.
 */
const NOW = Date.parse('2026-09-05T12:00:00.000Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('lastUsedAt 재기록 판정', () => {
  it('창 안이면 쓰지 않는다 — 이게 트래픽을 없애는 부분이다', () => {
    expect(shouldRefreshLastUsed(iso(0), NOW)).toBe(false);
    expect(shouldRefreshLastUsed(iso(59_000), NOW)).toBe(false);
  });

  it('창을 넘기면 쓴다', () => {
    expect(shouldRefreshLastUsed(iso(60_000), NOW)).toBe(true);
    expect(shouldRefreshLastUsed(iso(10 * 60_000), NOW)).toBe(true);
  });

  it('값이 깨져 있으면 쓴다 — 자가 복구', () => {
    expect(shouldRefreshLastUsed('', NOW)).toBe(true);
    expect(shouldRefreshLastUsed('nonsense', NOW)).toBe(true);
    expect(shouldRefreshLastUsed(undefined as unknown as string, NOW)).toBe(true);
  });

  it('미래 시각이어도 창 안으로 본다 (시계 오차로 폭주하지 않는다)', () => {
    expect(shouldRefreshLastUsed(new Date(NOW + 5_000).toISOString(), NOW)).toBe(false);
  });
});
