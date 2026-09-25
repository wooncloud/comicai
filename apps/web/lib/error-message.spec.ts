import { describe, expect, it } from 'vitest';
import { renderCategoryMessage } from './error-message';

describe('renderCategoryMessage', () => {
  it('분류별 한국어 문장을 준다', () => {
    expect(renderCategoryMessage('auth')).toContain('지금은 그림을 만들 수 없습니다');
    expect(renderCategoryMessage('safety')).toContain('안전 정책');
    expect(renderCategoryMessage('timeout')).toContain('오래 걸려');
  });

  it('모르는 분류와 빈 값은 일반 문장으로 떨어진다', () => {
    for (const c of [undefined, '', 'nope', 'no gemini key']) {
      expect(renderCategoryMessage(c)).toBe(
        '이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요',
      );
    }
  });

  it('서버가 보낸 개발자용 문자열이 절대 섞이지 않는다', () => {
    // 2026-09-25: 플랫폼 키가 비었을 때 화면에 `no gemini key` 가 그대로 떴다.
    for (const c of ['auth', 'invalid', undefined]) {
      expect(renderCategoryMessage(c)).not.toMatch(/gemini|openai|key|no /i);
    }
  });
});
