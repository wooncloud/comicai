import { describe, expect, it } from 'vitest';
import { formatKoreanDateTime } from './datetime';

describe('formatKoreanDateTime', () => {
  it('UTC 를 한국 시각으로 옮겨 한국어로 쓴다', () => {
    // 2026-09-25T11:59Z = 한국 시각 같은 날 오후 8:59
    expect(formatKoreanDateTime(new Date('2026-09-25T11:59:00Z'))).toBe(
      '2026년 9월 25일 오후 8:59',
    );
  });

  it('오전/오후가 한국어다 — Node 의 ICU 는 여기서 PM 을 준다', () => {
    expect(formatKoreanDateTime(new Date('2026-09-25T00:30:00Z'))).toBe(
      '2026년 9월 25일 오전 9:30',
    );
  });

  it('정오와 자정을 12 로 쓴다', () => {
    // 03:00Z = 한국 정오
    expect(formatKoreanDateTime(new Date('2026-09-25T03:00:00Z'))).toBe(
      '2026년 9월 25일 오후 12:00',
    );
    // 15:00Z = 한국 자정(다음 날)
    expect(formatKoreanDateTime(new Date('2026-09-25T15:00:00Z'))).toBe(
      '2026년 9월 26일 오전 12:00',
    );
  });
});
