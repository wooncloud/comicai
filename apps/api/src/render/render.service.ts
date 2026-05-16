import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@comicai/db';
import type { ModelId, RenderJobDTO, RenderStatus, ImageRef, RenderError } from '@comicai/types';
import { PanelsService } from '../panels/panels.service';
import { buildRenderIR } from './ir.builder';
import { RenderQueue, idempotencyKey } from './render.queue';

const PANEL_HISTORY_MAX = 20;

@Injectable()
export class RenderService {
  constructor(
    private readonly panels: PanelsService,
    private readonly queue: RenderQueue,
  ) {}

  async startRender(
    userId: string,
    panelId: string,
    model: ModelId,
    seed?: number,
  ): Promise<{ jobId: string }> {
    const panel = await this.panels.assertOwned(userId, panelId);
    const ir = await buildRenderIR(panel.id, seed);
    if (!ir.userPrompt.trim() && !ir.contiSketch && ir.userImages.length === 0) {
      throw new BadRequestException({
        code: 'RENDER_INVALID_INPUT',
        message: '본문/콘티/참조 이미지 중 하나는 필요합니다.',
      });
    }

    // jobId = sha256(ir + user + model) — spec 07-error-reliability §3.
    // 동일 입력에 대한 중복 요청을 멱등 처리: 기존 작업이 있으면 그대로 반환.
    const jobId = idempotencyKey(ir, userId, model);
    const existing = await prisma.renderJob.findUnique({ where: { id: jobId } });
    if (existing) {
      return { jobId };
    }

    await prisma.renderJob.create({
      data: {
        id: jobId,
        panelId: panel.id,
        userId,
        model,
        ir: ir as unknown as object,
        status: 'queued',
      },
    });
    await this.queue.enqueue({ renderJobId: jobId, userId, model }, ir);

    const fresh = await prisma.panel.findUnique({
      where: { id: panel.id },
      select: { history: true },
    });
    const next = trimHistory([...(fresh?.history ?? []), jobId]);
    await prisma.panel.update({
      where: { id: panel.id },
      data: { currentRenderId: jobId, history: { set: next } },
    });
    return { jobId };
  }

  async getJob(userId: string, id: string): Promise<RenderJobDTO> {
    const row = await prisma.renderJob.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });
    }
    return {
      id: row.id,
      panelId: row.panelId,
      userId: row.userId,
      model: row.model as ModelId,
      status: row.status as RenderStatus,
      resultImage: (row.resultImage as unknown as ImageRef) ?? null,
      error: (row.error as unknown as RenderError) ?? null,
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }

  async cancel(userId: string, id: string) {
    const job = await this.getJob(userId, id);
    if (job.status === 'succeeded' || job.status === 'failed') {
      throw new BadRequestException({ code: 'CONFLICT', message: '이미 완료된 작업입니다.' });
    }
    await prisma.renderJob.update({
      where: { id },
      data: { status: 'canceled', finishedAt: new Date() },
    });
  }
}

function trimHistory(ids: string[]): string[] {
  if (ids.length <= PANEL_HISTORY_MAX) return ids;
  return ids.slice(ids.length - PANEL_HISTORY_MAX);
}
