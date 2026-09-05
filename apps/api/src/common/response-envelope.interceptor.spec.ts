import { describe, it, expect } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function mockCtx(opts: { status?: number; contentType?: string } = {}) {
  const res = {
    statusCode: opts.status ?? 200,
    getHeader: (k: string) => (k.toLowerCase() === 'content-type' ? opts.contentType : undefined),
  };
  return { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ExecutionContext;
}

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps a plain object into { data }', async () => {
    const ctx = mockCtx();
    const handler = { handle: () => of({ id: 'abc', name: 'foo' }) };
    const out = await lastValueFrom(interceptor.intercept(ctx, handler as CallHandler));
    expect(out).toEqual({ data: { id: 'abc', name: 'foo' } });
  });

  it('wraps arrays into { data: [...] }', async () => {
    const ctx = mockCtx();
    const handler = { handle: () => of([1, 2, 3]) };
    const out = await lastValueFrom(interceptor.intercept(ctx, handler as CallHandler));
    expect(out).toEqual({ data: [1, 2, 3] });
  });

  it('passes 204 responses through unmodified', async () => {
    const ctx = mockCtx({ status: 204 });
    const handler = { handle: () => of(undefined) };
    const out = await lastValueFrom(interceptor.intercept(ctx, handler as CallHandler));
    expect(out).toBeUndefined();
  });

  it('does not wrap SSE responses', async () => {
    const ctx = mockCtx({ contentType: 'text/event-stream' });
    const handler = { handle: () => of('some sse chunk') };
    const out = await lastValueFrom(interceptor.intercept(ctx, handler as CallHandler));
    expect(out).toBe('some sse chunk');
  });
});
