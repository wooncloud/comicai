import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import type { ModelId, RenderIR } from '@comicai/types';
import { sha256Hex } from '../common/tokens';

export const RENDER_QUEUE_NAME = 'render';

export interface RenderJobData {
  renderJobId: string;
  userId: string;
  model: ModelId;
  apiKeyId?: string;
}

@Injectable()
export class RenderQueue implements OnModuleDestroy {
  readonly queue: Queue<RenderJobData>;
  readonly events: QueueEvents;
  private readonly redisUrl: string;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const connection = parseRedis(this.redisUrl);
    this.queue = new Queue<RenderJobData>(RENDER_QUEUE_NAME, { connection });
    this.events = new QueueEvents(RENDER_QUEUE_NAME, { connection });
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.events.close();
  }

  /**
   * BullMQ 잡 id 는 **DB 행의 id 와 같아야 한다.**
   *
   * 예전에는 여기서 `idempotencyKey(ir, ...)` 를 다시 계산했다. 그러면 재시도로 만든
   * 행(`..._r3`)이 이미 끝난 원본 잡과 같은 BullMQ id 를 갖게 되고, BullMQ 는 같은
   * id 의 add 를 조용히 무시한다(실패 잡은 아래 보존 기간 동안 Redis 에 남아 있다).
   * 결과는 DB 행만 'queued' 로 남고 워커가 영영 집어 가지 않는 상태다.
   */
  async enqueue(data: RenderJobData) {
    const jobId = data.renderJobId;
    await this.queue.add('render', data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400 },
      // 실패 잡은 사후 분석에 쓰이므로 남기되, false 로 두면 Redis 에 **영구 적재**된다.
      // 7일이면 원인을 들여다보기에 충분하고, 개수 상한이 폭주도 막는다.
      removeOnFail: { age: 7 * 86400, count: 1000 },
    });
    return jobId;
  }
}

export function parseRedis(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
  };
}

export function idempotencyKey(ir: RenderIR, userId: string, model: ModelId): string {
  return 'job_' + sha256Hex(JSON.stringify({ ir, userId, model })).slice(0, 32);
}
