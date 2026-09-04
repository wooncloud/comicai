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

/**
 * api 프로세스가 재시작하면 그 사이 워커가 Redis 로 발행한 이벤트는 아무도 받지 못하고
 * 사라진다(pub/sub 은 fire-and-forget). 새 프로세스의 버퍼도 비어 있어 재생할 것이 없다.
 * 그러면 그림은 정상 생성됐는데 화면만 영원히 '생성 중…' 이었다.
 */
describe('SseHub 스냅샷', () => {
  const succeeded = {
    type: 'status',
    jobId: 'j',
    status: 'succeeded',
  } as const;

  it('재생할 버퍼가 없으면 현재 상태를 한 번 보낸다', () => {
    const hub = new SseHub();
    const { writes, res } = makeRes();
    hub.subscribe('j', res, undefined, [succeeded]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"status":"succeeded"');
  });

  it('스냅샷에는 id 를 붙이지 않는다 — 붙이면 다음 재연결이 진짜 이벤트를 건너뛴다', () => {
    const hub = new SseHub();
    const { writes, res } = makeRes();
    hub.subscribe('j', res, undefined, [succeeded]);
    expect(writes[0]).not.toContain('id:');
  });

  it('재생할 것이 있으면 스냅샷을 보내지 않는다 — 섞으면 순서가 뒤집힌다', () => {
    const hub = new SseHub();
    hub.publish('j', { type: 'status', jobId: 'j', status: 'running' });
    const { writes, res } = makeRes();
    hub.subscribe('j', res, undefined, [succeeded]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"status":"running"');
  });

  it('Last-Event-ID 로 재생분이 모두 걸러지면 스냅샷이 나간다', () => {
    const hub = new SseHub();
    hub.publish('j', { type: 'status', jobId: 'j', status: 'running' });
    const { writes, res } = makeRes();
    hub.subscribe('j', res, '1', [succeeded]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"status":"succeeded"');
  });

  it('스냅샷을 넘기지 않으면 아무것도 보내지 않는다 (기존 호출부 동작 유지)', () => {
    const hub = new SseHub();
    const { writes, res } = makeRes();
    hub.subscribe('j', res);
    expect(writes).toHaveLength(0);
  });
});
