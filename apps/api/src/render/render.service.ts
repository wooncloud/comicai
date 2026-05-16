import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { ModelId, RenderJobDTO, RenderStatus, ImageRef, RenderError } from '@comicai/types';
import { PanelsService } from '../panels/panels.service';
import { buildRenderIR } from './ir.builder';
import { RenderQueue } from './render.queue';

@Injectable()
export class RenderService {
  constructor(
    private readonly panels: PanelsService,
    private readonly queue: RenderQueue,
  ) {}

  async startRender(userId: string, panelId: string, model: ModelId): Promise<{ jobId: string }> {
    const panel = await this.panels.assertOwned(userId, panelId);
    const ir = await buildRenderIR(panel.id);
    if (!ir.userPrompt.trim() && !ir.contiSketch && ir.userImages.length === 0) {
      throw new BadRequestException({ code: 'validation/invalid_input', message: '본문/콘티/참조 중 하나 필요' });
    }

    const jobId = newId('render');
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
    await prisma.panel.update({
      where: { id: panel.id },
      data: {
        currentRenderId: jobId,
        history: { push: jobId },
      },
    });
    return { jobId };
  }

  async getJob(userId: string, id: string): Promise<RenderJobDTO> {
    const row = await prisma.renderJob.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'resource/not_found' });
    if (row.userId !== userId) throw new NotFoundException({ code: 'resource/not_found' });
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
      throw new BadRequestException({ code: 'validation/invalid_input', message: '이미 완료' });
    }
    await prisma.renderJob.update({
      where: { id },
      data: { status: 'canceled', finishedAt: new Date() },
    });
  }
}
