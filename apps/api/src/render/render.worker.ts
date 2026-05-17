import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { prisma, Prisma } from '@comicai/db';
import { getAdapter, type AdapterContext } from '@comicai/adapters';
import type { ImageRef, RenderError, RenderIR, RenderStatus } from '@comicai/types';
import { RENDER_QUEUE_NAME, parseRedis, type RenderJobData } from './render.queue';
import { SseHub } from './sse.hub';
import { StorageService } from '../storage/storage.service';
import { ApiKeyBreaker } from '../api-keys/api-keys.breaker';
import { MetricsService } from '../metrics/metrics.service';
import { open } from '../api-keys/crypto';

// 어댑터 호출 전체 데드라인(상위 BullMQ 재시도가 다회 시도를 통해 긴 작업을 커버).
const MODEL_CALL_TIMEOUT_MS = 60_000;

@Injectable()
export class RenderWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<RenderJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly hub: SseHub,
    private readonly storage: StorageService,
    private readonly breaker: ApiKeyBreaker,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.RENDER_WORKER_DISABLED === '1') return;
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.worker = new Worker<RenderJobData>(
      RENDER_QUEUE_NAME,
      (job) => this.process(job.data, job.attemptsMade),
      {
        connection: parseRedis(url),
        concurrency: Number(process.env.RENDER_CONCURRENCY ?? 2),
      },
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(data: RenderJobData, attemptsMade: number): Promise<void> {
    const { renderJobId, userId, model } = data;
    const row = await prisma.renderJob.findUnique({ where: { id: renderJobId } });
    if (!row) return; // 취소 또는 삭제됨
    if (row.status === 'canceled') return;

    await prisma.renderJob.update({
      where: { id: renderJobId },
      data: { status: 'running', attempts: attemptsMade + 1 },
    });
    this.hub.publish(renderJobId, {
      type: 'status',
      jobId: renderJobId,
      status: 'running',
      attempts: attemptsMade + 1,
    });

    const adapter = getAdapter(model);
    const ir = row.ir as unknown as RenderIR;
    const { id: apiKeyId, secret: apiKey } = await this.resolveApiKey(userId, model);

    const ac = new AbortController();
    const abortTimer = setTimeout(() => ac.abort(), MODEL_CALL_TIMEOUT_MS);
    const ctx: AdapterContext = { loadReference: (key) => this.storage.getBytes(key) };

    const stopTimer = this.metrics.renderDuration.startTimer({ model });
    let outcome = 'unknown';
    try {
      const req = adapter.buildRequest(ir, apiKey);
      const raw = await adapter.call(req, ac.signal, ctx);
      const stored: ImageRef = await this.storage.putImage(
        { kind: 'render', renderJobId },
        raw.bytes,
        raw.mimeType,
        raw.width,
        raw.height,
      );
      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: 'succeeded',
          resultImage: stored as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      this.hub.publish(renderJobId, {
        type: 'status',
        jobId: renderJobId,
        status: 'succeeded',
        resultImage: stored,
      });
      if (apiKeyId) await this.breaker.recordSuccess(apiKeyId);
      outcome = 'succeeded';
    } catch (err) {
      const classified: RenderError = adapter.classifyError(err);
      outcome = classified.category;
      if (classified.category === 'auth' && apiKeyId) {
        await this.breaker.recordAuthFailure(apiKeyId);
      }
      // spec 07-error-reliability §3: transient/timeout만 재시도, 나머지는 즉시 실패.
      if (attemptsMade + 1 < retryLimitFor(classified.category)) {
        throw err;
      }
      const finalStatus: RenderStatus = classified.category === 'timeout' ? 'timeout' : 'failed';
      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: finalStatus,
          error: classified as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      this.hub.publish(renderJobId, { type: 'error', jobId: renderJobId, error: classified });
      this.hub.publish(renderJobId, { type: 'status', jobId: renderJobId, status: finalStatus });
    } finally {
      clearTimeout(abortTimer);
      stopTimer();
      this.metrics.renderAttemptsTotal.inc({ model, outcome });
    }
  }

  private async resolveApiKey(
    userId: string,
    model: string,
  ): Promise<{ id: string | null; secret: string }> {
    if (model === 'mock') return { id: null, secret: '' };
    const provider = model.startsWith('gemini') ? 'gemini' : 'openai';
    const row = await prisma.apiKey.findFirst({
      where: { userId, provider, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new RenderApiKeyMissing(`no ${provider} key`);
    return { id: row.id, secret: open({ ciphertext: row.ciphertext, nonce: row.nonce }) };
  }
}

export class RenderApiKeyMissing extends Error {
  readonly category = 'auth' as const;
}

function retryLimitFor(category: RenderError['category']): number {
  if (category === 'transient') return 3;
  if (category === 'timeout') return 2;
  return 1; // auth/quota/safety/invalid 즉시 실패
}
