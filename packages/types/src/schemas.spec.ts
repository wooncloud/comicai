import { describe, it, expect } from 'vitest';
import {
  CredentialsSchema,
  ExportRequestSchema,
  MAX_PAGE_DIMENSION,
  MAX_PANEL_COORD,
  PAGE_TEXT_FONT_FAMILIES,
  PageLineStyleSchema,
  PageTextStyleSchema,
  SpeechBubbleStyleSchema,
  PageCreateSchema,
  PagePatchSchema,
  PanelShapeSchema,
  ProjectCreateSchema,
  RenderStartSchema,
} from './schemas';

describe('CredentialsSchema', () => {
  it('accepts a valid email + strong password', () => {
    const r = CredentialsSchema.safeParse({ email: 'a@b.co', password: 'Strong1Pass' });
    expect(r.success).toBe(true);
  });

  it('rejects passwords shorter than 10', () => {
    const r = CredentialsSchema.safeParse({ email: 'a@b.co', password: 'Abc1' });
    expect(r.success).toBe(false);
  });

  it('rejects passwords missing digits or letters', () => {
    expect(CredentialsSchema.safeParse({ email: 'a@b.co', password: 'onlyletters' }).success).toBe(
      false,
    );
    expect(CredentialsSchema.safeParse({ email: 'a@b.co', password: '1234567890' }).success).toBe(
      false,
    );
  });

  it('rejects malformed emails', () => {
    expect(
      CredentialsSchema.safeParse({ email: 'not-an-email', password: 'Strong1Pass' }).success,
    ).toBe(false);
  });
});

describe('ProjectCreateSchema', () => {
  it('requires a non-empty name', () => {
    expect(ProjectCreateSchema.safeParse({ name: '' }).success).toBe(false);
    expect(ProjectCreateSchema.safeParse({ name: 'My' }).success).toBe(true);
  });
});

describe('PageCreateSchema', () => {
  it('applies default size when omitted', () => {
    const r = PageCreateSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.size).toEqual({ w: 800, h: 1200 });
  });
});

/**
 * 이 상한들은 취향이 아니라 **메모리 상한**이다. export 가 페이지 크기로 sharp 캔버스를
 * 잡으므로, 상한이 없으면 size:{w:50000,h:50000} 하나로 프로세스를 죽이고 같은 컨테이너의
 * 다른 사용자 요청까지 끊을 수 있다.
 */
describe('페이지·패널 좌표 상한', () => {
  it('페이지 한 변이 상한을 넘으면 거부', () => {
    expect(PagePatchSchema.safeParse({ size: { w: 50000, h: 50000 } }).success).toBe(false);
    expect(PagePatchSchema.safeParse({ size: { w: MAX_PAGE_DIMENSION + 1, h: 100 } }).success).toBe(
      false,
    );
  });

  it('상한 이내는 그대로 통과', () => {
    expect(
      PagePatchSchema.safeParse({ size: { w: MAX_PAGE_DIMENSION, h: MAX_PAGE_DIMENSION } }).success,
    ).toBe(true);
    expect(PagePatchSchema.safeParse({ size: { w: 800, h: 1200 } }).success).toBe(true);
  });

  const shape = (x: number) => ({
    type: 'rect' as const,
    points: [
      { x, y: 0 },
      { x: x + 10, y: 0 },
      { x: x + 10, y: 10 },
    ],
  });

  it('패널 좌표가 범위를 벗어나면 거부', () => {
    expect(PanelShapeSchema.safeParse(shape(MAX_PANEL_COORD + 1)).success).toBe(false);
    expect(PanelShapeSchema.safeParse(shape(-MAX_PANEL_COORD - 1)).success).toBe(false);
    expect(PanelShapeSchema.safeParse(shape(Infinity)).success).toBe(false);
  });

  it('페이지 밖으로 조금 밀어 둔 패널은 정상 편집이라 통과', () => {
    expect(PanelShapeSchema.safeParse(shape(-100)).success).toBe(true);
  });
});

describe('RenderStartSchema', () => {
  it('rejects unknown models', () => {
    expect(RenderStartSchema.safeParse({ model: 'foo' }).success).toBe(false);
  });
  it('accepts known models', () => {
    expect(RenderStartSchema.safeParse({ model: 'mock' }).success).toBe(true);
  });
});

describe('ExportRequestSchema', () => {
  it('rejects dpi out of range', () => {
    expect(ExportRequestSchema.safeParse({ format: 'png', dpi: 50 }).success).toBe(false);
    expect(ExportRequestSchema.safeParse({ format: 'png', dpi: 1000 }).success).toBe(false);
  });
  it('accepts in-range dpi', () => {
    expect(ExportRequestSchema.safeParse({ format: 'png', dpi: 300 }).success).toBe(true);
  });
});

/**
 * 폰트 목록은 **한 벌이어야 한다.** 예전에는 index.ts 가 같은 이름을 지역 선언해서
 * (`export * from './schemas'` 보다 지역 선언이 우선한다) 소비자는 3개를, Zod 검증기는
 * 5개를 봤다 — 컴파일 에러 없이. 검증기가 넓으면 컨테이너에 설치되지 않은 폰트가
 * export SVG 의 font-family 로 나가고, 그때 한글이 통째로 사라진다.
 */
describe('PageTextStyleSchema fontFamily', () => {
  it('실제로 렌더되는 3개만 받는다', () => {
    expect([...PAGE_TEXT_FONT_FAMILIES]).toEqual(['sans-serif', 'serif', 'monospace']);
    for (const f of PAGE_TEXT_FONT_FAMILIES) {
      expect(PageTextStyleSchema.safeParse({ fontFamily: f }).success).toBe(true);
    }
  });

  it('컨테이너에 없는 폰트는 거부한다', () => {
    expect(PageTextStyleSchema.safeParse({ fontFamily: 'Pretendard' }).success).toBe(false);
    expect(PageTextStyleSchema.safeParse({ fontFamily: 'Inter' }).success).toBe(false);
  });
});

/**
 * 색 검증이 없으면 `"not-a-color"` 가 그대로 저장되고, export 가 그것을 SVG 의
 * fill/stroke 속성으로 내보낸다. 캔버스와 export 결과가 다르게 보이는데 **어느 쪽도
 * 오류를 내지 않는다** — 사용자는 "왜 내보낸 그림만 다르지" 만 알게 된다.
 * 웹은 이미 같은 정규식으로 막고 있었고(hex-color-field.tsx), 서버만 빠져 있었다.
 */
describe('스타일 색 검증', () => {
  const cases = [
    ['말풍선 선', SpeechBubbleStyleSchema, 'strokeColor'],
    ['말풍선 채움', SpeechBubbleStyleSchema, 'fillColor'],
    ['텍스트', PageTextStyleSchema, 'color'],
    ['직선', PageLineStyleSchema, 'strokeColor'],
  ] as const;

  it.each(cases)('%s: hex 는 통과', (_label, schema, field) => {
    expect(schema.safeParse({ [field]: '#ff0000' }).success).toBe(true);
    expect(schema.safeParse({ [field]: '#f00' }).success).toBe(true);
    expect(schema.safeParse({ [field]: '#ff0000aa' }).success).toBe(true);
  });

  it.each(cases)('%s: hex 가 아니면 거부', (_label, schema, field) => {
    expect(schema.safeParse({ [field]: 'not-a-color' }).success).toBe(false);
    expect(schema.safeParse({ [field]: 'red' }).success).toBe(false);
    expect(schema.safeParse({ [field]: '' }).success).toBe(false);
  });

  it('생략하면 기본값이 채워진다 (부분 갱신 전제)', () => {
    const r = SpeechBubbleStyleSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fillColor).toBe('#ffffff');
  });
});
