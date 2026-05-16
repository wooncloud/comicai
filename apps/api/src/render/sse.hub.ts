import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { formatSseEvent, type RenderSseEvent } from '@comicai/events';

/**
 * jobId 별 SSE 구독자 집합. 메모리 단일 인스턴스 가정.
 * (멀티 워커 환경에선 Redis pub/sub로 확장)
 */
@Injectable()
export class SseHub {
  private readonly subs = new Map<string, Set<Response>>();
  private readonly buffers = new Map<string, RenderSseEvent[]>();

  subscribe(jobId: string, res: Response) {
    let set = this.subs.get(jobId);
    if (!set) {
      set = new Set();
      this.subs.set(jobId, set);
    }
    set.add(res);
    // 최근 이벤트 리플레이 (재연결 대비)
    for (const evt of this.buffers.get(jobId) ?? []) {
      res.write(formatSseEvent(evt));
    }
    res.on('close', () => {
      set!.delete(res);
      if (set!.size === 0) this.subs.delete(jobId);
    });
  }

  publish(jobId: string, evt: RenderSseEvent) {
    const buf = this.buffers.get(jobId) ?? [];
    buf.push(evt);
    if (buf.length > 64) buf.shift();
    this.buffers.set(jobId, buf);
    const subs = this.subs.get(jobId);
    if (!subs) return;
    const wire = formatSseEvent(evt);
    for (const res of subs) res.write(wire);
  }

  ping(jobId: string) {
    this.publish(jobId, { type: 'ping', at: new Date().toISOString() });
  }
}
