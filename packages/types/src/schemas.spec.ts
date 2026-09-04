import { describe, it, expect } from 'vitest';
import {
  CredentialsSchema,
  ExportRequestSchema,
  MAX_PAGE_DIMENSION,
  MAX_PANEL_COORD,
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
