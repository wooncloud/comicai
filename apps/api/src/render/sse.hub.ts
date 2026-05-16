import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { formatSseEvent, type RenderSseEvent } from '@comicai/events';

interface BufferedEvent {
  seq: number;
  evt: RenderSseEvent;
}

const BUFFER_LIMIT = 64;

/**
 * jobId 별 SSE 구독자 집합. 메모리 단일 인스턴스 가정.
 * (멀티 워커 환경에선 Redis pub/sub로 확장)
 *
 * 각 이벤트에 단조 증가 seq id를 부여하고 마지막 BUFFER_LIMIT개를 보관.
 * 클라이언트는 Last-Event-ID 헤더로 누락분만 받아간다 (spec 07-error-reliability).
 */
@Injectable()
export class SseHub {
  private readonly subs = new Map<string, Set<Response>>();
  private readonly buffers = new Map<string, BufferedEvent[]>();
  private readonly counters = new Map<string, number>();

  subscribe(jobId: string, res: Response, lastEventId?: string) {
    let set = this.subs.get(jobId);
    if (!set) {
      set = new Set();
      this.subs.set(jobId, set);
    }
    set.add(res);
    const since = parseLastEventId(lastEventId);
    for (const buffered of this.buffers.get(jobId) ?? []) {
      if (buffered.seq > since) {
        res.write(formatSseEvent(buffered.evt, buffered.seq));
      }
    }
    res.on('close', () => {
      set!.delete(res);
      if (set!.size === 0) this.subs.delete(jobId);
    });
  }

  publish(jobId: string, evt: RenderSseEvent) {
    const seq = (this.counters.get(jobId) ?? 0) + 1;
    this.counters.set(jobId, seq);
    const buf = this.buffers.get(jobId) ?? [];
    buf.push({ seq, evt });
    if (buf.length > BUFFER_LIMIT) buf.shift();
    this.buffers.set(jobId, buf);
    const subs = this.subs.get(jobId);
    if (!subs) return;
    const wire = formatSseEvent(evt, seq);
    for (const res of subs) res.write(wire);
  }

  ping(jobId: string) {
    this.publish(jobId, { type: 'ping', at: new Date().toISOString() });
  }
}

function parseLastEventId(raw?: string): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
