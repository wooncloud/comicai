import { describe, it, expect, vi } from 'vitest';
import { SseHub } from './sse.hub';

function makeRes() {
  const writes: string[] = [];
  let onClose: () => void = () => undefined;
  return {
    writes,
    res: {
      write: (chunk: string) => writes.push(chunk),
      on: (evt: string, cb: () => void) => {
        if (evt === 'close') onClose = cb;
      },
      close: () => onClose(),
    } as never,
  };
}

describe('SseHub', () => {
  it('replays all buffered events for a fresh subscriber', () => {
    const hub = new SseHub();
    hub.publish('job_1', { type: 'status', jobId: 'job_1', status: 'queued' });
    hub.publish('job_1', { type: 'status', jobId: 'job_1', status: 'running' });
    const { writes, res } = makeRes();
    hub.subscribe('job_1', res);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain('id: 1');
    expect(writes[1]).toContain('id: 2');
  });

  it('skips events <= Last-Event-ID on reconnect', () => {
    const hub = new SseHub();
    hub.publish('j', { type: 'status', jobId: 'j', status: 'queued' });
    hub.publish('j', { type: 'status', jobId: 'j', status: 'running' });
    hub.publish('j', { type: 'status', jobId: 'j', status: 'succeeded' });
    const { writes, res } = makeRes();
    hub.subscribe('j', res, '2');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('id: 3');
    expect(writes[0]).toContain('"status":"succeeded"');
  });

  it('drops subscriber on close', () => {
    const hub = new SseHub();
    const { res } = makeRes();
    hub.subscribe('x', res);
    // 정상 동작: close 후 publish는 추가 write를 일으키지 않음.
    (res as unknown as { close: () => void }).close();
    hub.publish('x', { type: 'status', jobId: 'x', status: 'queued' });
    // 새 구독 시에도 위 publish는 버퍼에 남아 다시 replay됨.
    const { writes, res: res2 } = makeRes();
    hub.subscribe('x', res2);
    expect(writes).toHaveLength(1);
  });
});
