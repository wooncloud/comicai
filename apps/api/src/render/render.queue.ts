import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { createHash } from 'node:crypto';
import type { ModelId, RenderIR } from '@comicai/types';

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

  async enqueue(data: RenderJobData, ir: RenderIR) {
    const jobId = idempotencyKey(ir, data.userId, data.model);
    await this.queue.add('render', data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: false,
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
  return (
    'job_' +
    createHash('sha256').update(JSON.stringify({ ir, userId, model })).digest('hex').slice(0, 32)
  );
}
