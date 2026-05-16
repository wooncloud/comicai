import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import Redis from 'ioredis';
import { formatSseEvent, type RenderSseEvent } from '@comicai/events';

interface BufferedEvent {
  seq: number;
  evt: RenderSseEvent;
}

const BUFFER_LIMIT = 64;
const TERMINAL_RETENTION_MS = 5 * 60_000;
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timeout', 'canceled']);
const CHANNEL_PREFIX = 'render:events:';
const CHANNEL_PATTERN = CHANNEL_PREFIX + '*';

/**
 * 렌더 작업의 SSE 이벤트 허브.
 * - 같은 프로세스에서 발행된 이벤트: in-memory deliver로 즉시 fan-out.
 * - 다른 프로세스(분리된 worker)에서 발행: Redis pub/sub로 받아 fan-out.
 * - 자신이 발행한 메시지는 originId로 식별해 중복 deliver를 피함.
 */
@Injectable()
export class SseHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SseHub');
  private readonly subs = new Map<string, Set<Response>>();
  private readonly buffers = new Map<string, BufferedEvent[]>();
  private readonly counters = new Map<string, number>();
  private readonly cleanupTimers = new Map<string, NodeJS.Timeout>();
  private readonly instanceId = randomUUID();
  private publisher?: Redis;
  private subscriber?: Redis;

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.publisher = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
    this.publisher.on('error', (e) => this.logger.warn(`redis publisher: ${e.message}`));
    this.subscriber.on('error', (e) => this.logger.warn(`redis subscriber: ${e.message}`));
    await this.subscriber.psubscribe(CHANNEL_PATTERN);
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const payload = JSON.parse(message) as { originId: string; evt: RenderSseEvent };
        if (payload.originId === this.instanceId) return;
        const jobId = channel.slice(CHANNEL_PREFIX.length);
        this.deliver(jobId, payload.evt);
      } catch (err) {
        this.logger.warn(`bad sse payload on ${channel}: ${(err as Error).message}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit();
    await this.publisher?.quit();
  }

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

  publish(jobId: string, evt: RenderSseEvent): void {
    this.deliver(jobId, evt);
    if (!this.publisher) return;
    const payload = JSON.stringify({ originId: this.instanceId, evt });
    this.publisher
      .publish(CHANNEL_PREFIX + jobId, payload)
      .catch((err) => this.logger.warn(`redis publish 실패: ${(err as Error).message}`));
  }

  ping(jobId: string): void {
    this.publish(jobId, { type: 'ping', at: new Date().toISOString() });
  }

  private deliver(jobId: string, evt: RenderSseEvent): void {
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
