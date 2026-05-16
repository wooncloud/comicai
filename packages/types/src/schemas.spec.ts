import { describe, it, expect } from 'vitest';
import {
  CredentialsSchema,
  ExportRequestSchema,
  PageCreateSchema,
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
