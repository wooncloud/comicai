import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { formatSseEvent, type RenderSseEvent } from '@comicai/events';

interface BufferedEvent {
  seq: number;
  evt: RenderSseEvent;
}

const BUFFER_LIMIT = 64;
// 완료/실패 후 재연결 클라이언트의 마지막 replay를 위해 5분간 유지.
const TERMINAL_RETENTION_MS = 5 * 60_000;
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timeout', 'canceled']);

@Injectable()
export class SseHub {
  private readonly subs = new Map<string, Set<Response>>();
  private readonly buffers = new Map<string, BufferedEvent[]>();
  private readonly counters = new Map<string, number>();
  private readonly cleanupTimers = new Map<string, NodeJS.Timeout>();

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
    if (subs) {
      const wire = formatSseEvent(evt, seq);
      for (const res of subs) res.write(wire);
    }
    if (evt.type === 'status' && TERMINAL_STATUSES.has(evt.status)) {
      this.scheduleCleanup(jobId);
    }
  }

  ping(jobId: string) {
    this.publish(jobId, { type: 'ping', at: new Date().toISOString() });
  }

  private scheduleCleanup(jobId: string) {
    const existing = this.cleanupTimers.get(jobId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.buffers.delete(jobId);
      this.counters.delete(jobId);
      this.cleanupTimers.delete(jobId);
    }, TERMINAL_RETENTION_MS);
    t.unref?.();
    this.cleanupTimers.set(jobId, t);
  }
}

function parseLastEventId(raw?: string): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
