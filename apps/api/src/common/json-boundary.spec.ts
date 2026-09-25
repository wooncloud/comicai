import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_TEXT_FONT_FAMILIES,
  coercePageTextFontFamily,
  defaultPageLineStyle,
  defaultPageTextStyle,
  defaultSpeechBubbleStyle,
} from '@comicai/types';
import { readPageSize } from './page-size';

/**
 * Prisma 의 Json 컬럼은 `as` 캐스팅으로 읽는다 — 타입이 실제 값을 보장하지 않는다.
 * 형태가 깨진 행이 하나 있으면 그 값을 그대로 읽는 UI 가 죽으므로, 서비스가
 * DTO 로 바꿀 때 흡수해야 한다. 그 규칙을 여기서 고정한다.
 *
 * 크기는 실제로 도는 함수(`readPageSize`)를 그대로 부른다. 예전에는 서비스 안의
 * private 함수라 여기서 규칙을 베껴 시험했고, 그 사이 기본 크기가 바뀌어 **테스트는
 * 옛 규칙을, 서비스는 또 다른 값을** 들고 있었다.
 */

describe('page.size Json 경계', () => {
  it('정상 값은 그대로 통과한다', () => {
    expect(readPageSize({ w: 1024, h: 1536 })).toEqual({ w: 1024, h: 1536 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['빈 객체', {}],
    ['배열(잘못된 형태)', []],
    ['문자열 값', { w: '800', h: '1200' }],
    ['음수', { w: -10, h: 0 }],
  ])('%s 이면 새 페이지의 기본 크기로 흡수한다', (_label, raw) => {
    expect(readPageSize(raw)).toEqual(DEFAULT_PAGE_SIZE);
  });

  it('한쪽만 깨져 있으면 그쪽만 채운다', () => {
    expect(readPageSize({ w: 1024 })).toEqual({ w: 1024, h: DEFAULT_PAGE_SIZE.h });
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
