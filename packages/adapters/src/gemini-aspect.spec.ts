import { describe, expect, it } from 'vitest';
import { nearestGeminiAspectRatio } from './gemini';

/**
 * Gemini 가 실제로 돌려준 허용 목록. `-preview` 와 정식판 `gemini-3.1-flash-image`
 * 둘 다 같은 목록을 돌려준다(2026-09-25, 잘못된 비율을 보내 400 본문으로 확인).
 * 여기 없는 값을 보내면 400 이라 컷이 한 장도 안 그려진다.
 */
const ALLOWED = new Set([
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
]);

describe('nearestGeminiAspectRatio', () => {
  it('허용 목록 밖의 값을 항상 허용되는 값으로 바꾼다', () => {
    // 사람이 캔버스에 그린 컷에서 실제로 나온 비율들.
    for (const raw of ['73:28', '730:280', '37:14', '101:97', '5:13', '999:1', '1:999']) {
      expect(ALLOWED.has(nearestGeminiAspectRatio(raw))).toBe(true);
    }
  });

  it('이미 허용되는 값은 그대로 둔다', () => {
    for (const raw of ALLOWED) expect(nearestGeminiAspectRatio(raw)).toBe(raw);
  });

  it('가장 가까운 비율을 고른다', () => {
    expect(nearestGeminiAspectRatio('73:28')).toBe('21:9'); // 2.607 → 2.333
    expect(nearestGeminiAspectRatio('100:99')).toBe('1:1');
    expect(nearestGeminiAspectRatio('9:17')).toBe('9:16');
    expect(nearestGeminiAspectRatio('1000:120')).toBe('8:1');
  });

  it('망가진 입력에도 400 을 만들지 않는다', () => {
    for (const raw of ['', 'abc', '1:0', '0:1', '1', ':', 'NaN:3']) {
      expect(ALLOWED.has(nearestGeminiAspectRatio(raw))).toBe(true);
    }
  });
});
