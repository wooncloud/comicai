import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@comicai/db';
import type { ModelId, RenderJobDTO, RenderStatus, ImageRef, RenderError } from '@comicai/types';
import { PanelsService } from '../panels/panels.service';
import { StorageService } from '../storage/storage.service';
import { buildRenderIR } from './ir.builder';
import { RenderQueue, idempotencyKey } from './render.queue';

@Injectable()
export class RenderService {
  constructor(
    private readonly panels: PanelsService,
    private readonly queue: RenderQueue,
    private readonly storage: StorageService,
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
        ir: ir as unknown as Prisma.InputJsonValue,
        status: 'queued',
      },
    });
    await this.queue.enqueue({ renderJobId: jobId, userId, model }, ir);

    await prisma.panel.update({
      where: { id: panel.id },
      data: { currentRenderId: jobId, history: { push: jobId } },
    });
    return { jobId };
  }

  async getJob(userId: string, id: string): Promise<RenderJobDTO> {
    const row = await prisma.renderJob.findUnique({ where: { id } });
    if (row?.userId !== userId) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });
    }
    const resultImage = (row.resultImage as unknown as ImageRef) ?? null;
    const status = row.status as RenderStatus;
    return {
      id: row.id,
      panelId: row.panelId,
      userId: row.userId,
      model: row.model as ModelId,
      status,
      resultImage,
      resultImageUrl: await this.storage.presignIfSucceeded(resultImage, status),
      error: (row.error as unknown as RenderError) ?? null,
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }

  async cancel(userId: string, id: string) {
    const row = await prisma.renderJob.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });
    if (row?.userId !== userId) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });
    }
    if (row.status === 'succeeded' || row.status === 'failed') {
      throw new BadRequestException({ code: 'CONFLICT', message: '이미 완료된 작업입니다.' });
    }
    await prisma.renderJob.update({
      where: { id },
      data: { status: 'canceled', finishedAt: new Date() },
    });
  }
}
