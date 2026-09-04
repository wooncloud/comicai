import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import Redis from 'ioredis';
import { isFlagOn } from '@comicai/types';
import {
  decodePubSubEnvelope,
  encodePubSubEnvelope,
  formatSseEvent,
  type RenderSseEvent,
} from '@comicai/events';
import { redisUrl } from '../common/env';

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
 * 렌더 작업 SSE 허브.
 * - 같은 프로세스에서 발행된 이벤트는 in-memory deliver로 즉시 fan-out.
 * - 분리된 worker가 발행한 이벤트는 Redis pub/sub로 받아 fan-out.
 * - originId로 자기 echo 차단.
 *
 * 역할:
 *  RENDER_WORKER_DISABLED=1 (api 전용): subscriber만 만든다. ping/publish는 in-memory only.
 *  RENDER_WORKER_DISABLED=0 (worker 또는 단일 프로세스): publisher만 만든다.
 *  publish는 항상 deliver 먼저, 그 다음 publisher가 있을 때만 Redis publish.
 *  ping은 항상 local-only (Redis 라운드트립 회피).
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

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // 예전에는 이 파일만 `process.env` 를 직접 읽었다 — 그러면 SSE 만 다른 Redis 를 볼 수
    // 있고, 증상은 "워커 이벤트가 브라우저에 안 간다" 로 나타난다(common/env.ts 참고).
    if (isFlagOn(process.env.SSE_HUB_DISABLED)) return;
    const url = redisUrl(this.config);
    const isApiOnly = isFlagOn(process.env.RENDER_WORKER_DISABLED);

    if (isApiOnly) {
      this.subscriber = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
      this.subscriber.on('error', (e) => this.logger.warn(`redis subscriber: ${e.message}`));
      await this.subscriber.psubscribe(CHANNEL_PATTERN);
      this.subscriber.on('pmessage', (_pattern, channel, message) => {
        try {
          const envelope = decodePubSubEnvelope(message);
          if (envelope.originId === this.instanceId) return;
          const jobId = channel.slice(CHANNEL_PREFIX.length);
          this.deliver(jobId, envelope.evt);
        } catch (err) {
          this.logger.warn(`bad sse payload on ${channel}: ${(err as Error).message}`);
        }
      });
    } else {
      this.publisher = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: null });
      this.publisher.on('error', (e) => this.logger.warn(`redis publisher: ${e.message}`));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit();
    await this.publisher?.quit();
  }

  /**
   * @param snapshot 재생할 버퍼가 없을 때 대신 흘려보낼 현재 상태.
   *
   * Redis pub/sub 은 fire-and-forget 이라, api 프로세스가 죽어 있는 사이 워커가 발행한
   * `succeeded` 는 **아무도 받지 못하고 사라진다.** 브라우저 EventSource 는 재연결하지만
   * 새 프로세스의 버퍼는 비어 있어 재생할 것이 없다. 그러면 그림은 정상 생성됐는데
   * 화면만 영원히 '생성 중…' 이다(프런트에 폴링도 없다).
   *
   * 컨트롤러는 권한 확인을 위해 이미 DB 에서 잡을 읽는다 — **알면서 버리던 그 값**을
   * 여기로 넘겨 첫 프레임으로 쓴다.
   *
   * 재생할 것이 있으면 보내지 않는다. 이 프로세스가 그 잡을 지켜본 적이 있다는 뜻이고,
   * 그때는 버퍼가 DB 보다 최신일 수 있다 — 둘을 섞으면 succeeded 뒤에 running 이
   * 도착하는 순서 뒤집힘이 생긴다.
   *
   * `id:` 를 붙이지 않는 이유: 스냅샷은 스트림의 새 위치가 아니다. 붙이면 브라우저의
   * Last-Event-ID 가 밀려 다음 재연결에서 진짜 이벤트를 건너뛴다.
   */
  subscribe(jobId: string, res: Response, lastEventId?: string, snapshot: RenderSseEvent[] = []) {
    let set = this.subs.get(jobId);
    if (!set) {
      set = new Set();
      this.subs.set(jobId, set);
    }
    set.add(res);
    const since = parseLastEventId(lastEventId);
    let replayed = 0;
    for (const buffered of this.buffers.get(jobId) ?? []) {
      if (buffered.seq > since) {
        res.write(formatSseEvent(buffered.evt, buffered.seq));
        replayed++;
      }
    }
    if (replayed === 0) {
      for (const evt of snapshot) res.write(formatSseEvent(evt));
    }
    res.on('close', () => {
      set.delete(res);
      if (set.size === 0) this.subs.delete(jobId);
    });
  }

  publish(jobId: string, evt: RenderSseEvent): void {
    this.deliver(jobId, evt);
    if (!this.publisher) return;
    this.publisher
      .publish(CHANNEL_PREFIX + jobId, encodePubSubEnvelope({ originId: this.instanceId, evt }))
      .catch((err) => this.logger.warn(`redis publish 실패: ${(err as Error).message}`));
  }

  /** Keep-alive heartbeat. 다른 프로세스에 전파할 필요 없으므로 local-only. */
  /**
   * Redis 가 실제로 응답하는지. 헬스체크 전용이다.
   *
   * SSE_HUB_DISABLED 로 Redis 를 안 쓰는 구성에서는 검사할 대상이 없으므로 통과시킨다 —
   * 없는 의존성을 죽었다고 보고하면 헬스체크가 영영 빨간색이 된다.
   */
  async healthPing(): Promise<void> {
    const client = this.publisher ?? this.subscriber;
    if (!client) return;
    await client.ping();
  }

  ping(jobId: string): void {
    this.deliver(jobId, { type: 'ping', at: new Date().toISOString() });
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
