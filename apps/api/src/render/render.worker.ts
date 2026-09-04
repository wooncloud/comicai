import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { prisma, Prisma } from '@comicai/db';
import { getAdapter, type AdapterContext } from '@comicai/adapters';
import {
  type ImageRef,
  type ModelId,
  type RenderError,
  type RenderIR,
  type RenderStatus,
} from '@comicai/types';
import { RENDER_QUEUE_NAME, parseRedis, type RenderJobData } from './render.queue';
import { SseHub } from './sse.hub';
import { ModelCredentials } from './model-credentials';
import { classifyModelError } from './model-error';
import { StorageService } from '../storage/storage.service';
import { ApiKeyBreaker } from '../api-keys/api-keys.breaker';
import { MetricsService } from '../metrics/metrics.service';

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
    private readonly credentials: ModelCredentials,
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

    /*
     * 안전망. process() 안에서 처리하지 못한 예외로 잡이 끝났을 때, DB 행이
     * 'running' 인 채로 남지 않게 마감한다.
     *
     * 없으면 그 컷은 영구히 '생성 중…' 이 되고 다시 그릴 수도 없다 —
     * 인스펙터의 생성 버튼이 status 로 잠기기 때문이다.
     *
     * 재시도가 남아 있는 실패(transient/timeout)까지 마감하면 안 되므로
     * BullMQ 가 더 이상 재시도하지 않을 때만 처리한다.
     */
    this.worker.on('failed', (job, err) => {
      if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
      void this.finalizeOrphan(job.data.renderJobId, err);
    });
  }

  /** 처리되지 못한 예외로 끝난 잡을 실패로 마감한다. 이미 종결된 행은 건드리지 않는다. */
  private async finalizeOrphan(renderJobId: string, err: unknown): Promise<void> {
    try {
      // 분류할 근거가 없다. 'transient' 로 두면 사용자에게 "잠시 후 다시" 안내가
      // 나가는데, 원인을 모르는 실패에는 그게 가장 정직하다.
      const error: RenderError = {
        category: 'transient',
        message: err instanceof Error ? err.message : String(err),
      };
      const { count } = await prisma.renderJob.updateMany({
        // status 조건이 핵심이다. 이 핸들러는 정상 실패 경로 뒤에도 불리므로,
        // 조건 없이 쓰면 방금 기록한 분류된 에러를 'unknown' 으로 덮어쓴다.
        where: { id: renderJobId, status: { in: ['queued', 'running'] } },
        data: {
          status: 'failed',
          error: error as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      if (count === 0) return;
      this.hub.publish(renderJobId, { type: 'error', jobId: renderJobId, error });
      this.hub.publish(renderJobId, { type: 'status', jobId: renderJobId, status: 'failed' });
    } catch {
      // 마감 자체가 실패해도 워커를 죽이지 않는다. 다음 잡은 계속 처리돼야 한다.
    }
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

    const ac = new AbortController();
    const abortTimer = setTimeout(() => ac.abort(), MODEL_CALL_TIMEOUT_MS);
    const ctx: AdapterContext = { loadReference: (key) => this.storage.getBytes(key) };

    const stopTimer = this.metrics.renderDuration.startTimer({ model });
    let outcome = 'unknown';
    // 잡을 'running' 으로 올린 뒤부터는 **모든 경로가 try 안에 있어야 한다.**
    // 예전에는 키 조회가 여기 바깥에 있어서, 키가 없으면 예외가 process() 밖으로
    // 튀어나가 아래 catch 의 상태 갱신·SSE 발행이 통째로 건너뛰어졌다. 그러면 행은
    // status='running', error=null 로 영구히 남고 사용자는 '생성 중…' 만 무한히 본다.
    // apiKeyId 는 breaker 기록에만 쓰므로 catch 에서도 읽을 수 있도록 밖에 둔다.
    let apiKeyId: string | null = null;
    try {
      const resolved = await this.credentials.resolve(userId, model);
      apiKeyId = resolved.id;
      const req = adapter.buildRequest(ir, resolved.secret);
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
      // 렌더 성공 시 콘티는 역할을 다했으므로 자동 제거(다음 렌더에 잔존하지 않도록).
      // R2 오브젝트는 일단 그대로 두고 panel.conti만 null화 — 추후 GC 대상.
      await prisma.panel.update({
        where: { id: row.panelId },
        data: { conti: Prisma.JsonNull },
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
      const classified = classifyModelError(err, adapter);
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
}

function retryLimitFor(category: RenderError['category']): number {
  if (category === 'transient') return 3;
  if (category === 'timeout') return 2;
  return 1; // auth/quota/safety/invalid 즉시 실패
}
