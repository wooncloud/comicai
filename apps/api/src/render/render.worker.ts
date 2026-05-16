import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { prisma } from '@comicai/db';
import { getAdapter, type AdapterContext } from '@comicai/adapters';
import type { ImageRef, RenderError, RenderIR } from '@comicai/types';
import { RENDER_QUEUE_NAME, type RenderJobData } from './render.queue';
import { SseHub } from './sse.hub';
import { StorageService } from '../storage/storage.service';

const JOB_TIMEOUT_MS = 120_000;
const MODEL_CALL_TIMEOUT_MS = 60_000;

@Injectable()
export class RenderWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<RenderJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly hub: SseHub,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    if (process.env.RENDER_WORKER_DISABLED === '1') return;
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const u = new URL(url);
    this.worker = new Worker<RenderJobData>(
      RENDER_QUEUE_NAME,
      (job) => this.process(job.data, job.attemptsMade),
      {
        connection: {
          host: u.hostname,
          port: Number(u.port || 6379),
          password: u.password || undefined,
        },
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
    const apiKey = await this.resolveApiKey(userId, model);

    const ac = new AbortController();
    const wholeTimer = setTimeout(() => ac.abort(), JOB_TIMEOUT_MS);
    const callTimer = setTimeout(() => ac.abort(), MODEL_CALL_TIMEOUT_MS);

    const ctx: AdapterContext = {
      loadReference: (key) => this.storage.getBytes(key),
    };

    try {
      const req = adapter.buildRequest(ir, apiKey);
      const raw = await adapter.call(req, ac.signal, ctx);
      clearTimeout(wholeTimer);
      clearTimeout(callTimer);
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
          resultImage: stored as unknown as object,
          finishedAt: new Date(),
        },
      });
      this.hub.publish(renderJobId, {
        type: 'status',
        jobId: renderJobId,
        status: 'succeeded',
        resultImage: stored,
      });
    } catch (err) {
      clearTimeout(wholeTimer);
      clearTimeout(callTimer);
      const classified: RenderError = adapter.classifyError(err);
      const retryable =
        (classified.category === 'transient' || classified.category === 'timeout') &&
        attemptsMade + 1 < 3;
      if (retryable) {
        throw err; // bullmq가 백오프 후 재시도
      }
      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: { status: 'failed', error: classified as unknown as object, finishedAt: new Date() },
      });
      this.hub.publish(renderJobId, { type: 'error', jobId: renderJobId, error: classified });
      this.hub.publish(renderJobId, { type: 'status', jobId: renderJobId, status: 'failed' });
    }
  }

  private async resolveApiKey(userId: string, model: string): Promise<string> {
    if (model === 'mock') return '';
    const provider = model.startsWith('gemini') ? 'gemini' : 'openai';
    const row = await prisma.apiKey.findFirst({
      where: { userId, provider, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new RenderApiKeyMissing(`no ${provider} key`);
    // 평문 복호화는 어댑터 호출 직전에만. 결과는 메모리 변수.
    const { open } = await import('../api-keys/crypto');
    return open({ ciphertext: row.ciphertext, nonce: row.nonce });
  }
}

export class RenderApiKeyMissing extends Error {
  readonly category = 'auth' as const;
}
