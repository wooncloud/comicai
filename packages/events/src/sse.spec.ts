import { describe, it, expect } from 'vitest';
import { formatSseEvent } from './index';

describe('formatSseEvent', () => {
  it('formats a status event', () => {
    const wire = formatSseEvent({ type: 'status', jobId: 'job_1', status: 'running' });
    expect(wire.startsWith('event: status')).toBe(true);
    expect(wire).toContain('data: {');
    expect(wire).toContain('"status":"running"');
    expect(wire.endsWith('\n\n')).toBe(true);
  });

  it('includes id when seq provided (Last-Event-ID 복구용)', () => {
    const wire = formatSseEvent({ type: 'ping', at: '2026-05-16T00:00:00Z' }, 42);
    expect(wire).toContain('id: 42');
  });

  it('omits id when not provided', () => {
    const wire = formatSseEvent({ type: 'ping', at: '2026-05-16T00:00:00Z' });
    expect(wire).not.toContain('id:');
  });
});
