import { describe, expect, it } from 'vitest';
import {
  PAGE_TEXT_FONT_FAMILIES,
  coercePageTextFontFamily,
  defaultPageLineStyle,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
} from '@comicai/types';

/**
 * Prisma 의 Json 컬럼은 `as` 캐스팅으로 읽는다 — 타입이 실제 값을 보장하지 않는다.
 * 형태가 깨진 행이 하나 있으면 그 값을 그대로 읽는 UI 가 죽으므로, 서비스가
 * DTO 로 바꿀 때 흡수해야 한다. 그 규칙을 여기서 고정한다.
 *
 * 구현은 각 서비스에 있고(pages.service.ts 의 toSize, page-texts.service.ts 의
 * normalizeStyle), 여기서는 같은 규칙을 재현해 계약을 문서화한다.
 */

/** pages.service.ts 의 toSize 와 동일한 규칙. */
function toSize(raw: unknown): { w: number; h: number } {
  const s = raw as { w?: unknown; h?: unknown } | null | undefined;
  return {
    w: typeof s?.w === 'number' && s.w > 0 ? s.w : 800,
    h: typeof s?.h === 'number' && s.h > 0 ? s.h : 1200,
  };
}

describe('page.size Json 경계', () => {
  it('정상 값은 그대로 통과한다', () => {
    expect(toSize({ w: 1024, h: 1536 })).toEqual({ w: 1024, h: 1536 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['빈 객체', {}],
    ['배열(잘못된 형태)', []],
    ['문자열 값', { w: '800', h: '1200' }],
    ['음수', { w: -10, h: 0 }],
  ])('%s 이면 기본 800×1200 으로 흡수한다', (_label, raw) => {
    expect(toSize(raw)).toEqual({ w: 800, h: 1200 });
  });

  it('한쪽만 깨져 있으면 그쪽만 채운다', () => {
    expect(toSize({ w: 1024 })).toEqual({ w: 1024, h: 1200 });
  });
});

describe('PageTextStyle.fontFamily Json 경계', () => {
  it('허용 목록의 값은 그대로 통과한다', () => {
    for (const f of PAGE_TEXT_FONT_FAMILIES) {
      expect(coercePageTextFontFamily(f)).toBe(f);
    }
  });

  it.each([
    ['제거된 폰트(Pretendard)', 'Pretendard'],
    ['제거된 폰트(Inter)', 'Inter'],
    ['알 수 없는 값', 'Comic Sans MS'],
    ['null', null],
    ['숫자', 42],
  ])('%s 이면 sans-serif 로 흡수한다', (_label, raw) => {
    expect(coercePageTextFontFamily(raw)).toBe('sans-serif');
  });
});

describe('스타일 기본값은 캔버스와 서버가 같은 출처를 쓴다', () => {
  // 예전에는 shape util·tool·packages/types 세 곳에 같은 값이 각각 적혀 있어서,
  // 공식 기본값을 바꿔도 새로 만드는 도형에는 반영되지 않았다.
  it('기본값은 모든 필드가 채워진 완전한 객체다', () => {
    expect(defaultPageLineStyle()).toEqual({
      strokeWidth: expect.any(Number),
      strokeColor: expect.any(String),
      strokeStyle: expect.any(String),
    });
    expect(defaultPageTextStyle()).toEqual({
      fontSize: expect.any(Number),
      fontFamily: expect.any(String),
      color: expect.any(String),
      textAlign: expect.any(String),
    });
    expect(defaultSpeechBubbleStyle()).toEqual({
      strokeWidth: expect.any(Number),
      strokeColor: expect.any(String),
      fillColor: expect.any(String),
    });
  });

  it('기본 폰트는 허용 목록 안에 있다', () => {
    expect(PAGE_TEXT_FONT_FAMILIES).toContain(defaultPageTextStyle().fontFamily);
  });
});
