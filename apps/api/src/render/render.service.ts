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

    /*
     * jobId 는 (ir, userId, model) 해시다. IR 이 결정적이라 같은 컷을 같은 내용으로
     * 다시 그리면 같은 id 가 나온다.
     *
     * 예전에는 같은 id 의 행이 있으면 상태를 보지 않고 그대로 돌려줬다. 그래서 한 번
     * 실패한 컷은 원인을 고친 뒤에도 **다시 그릴 방법이 없었다** — 버튼을 눌러도 죽은
     * 잡의 id 를 받아 갔고, 화면은 옛 실패를 다시 보여 주거나 그대로 멈춰 있었다.
     *
     * 아직 돌고 있는 잡만 합친다. 그게 이 해시의 실제 목적(더블클릭·중복 제출 방어)이다.
     * 끝난 잡은 성공이든 실패든 새로 만든다 — 같은 문장으로 다시 뽑아 보는 것도
     * 정상적인 사용이다.
     */
    const baseId = idempotencyKey(ir, userId, model);
    const existing = await prisma.renderJob.findUnique({ where: { id: baseId } });
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      return { jobId: baseId };
    }

    // 재시도는 새 id 를 받는다. 행을 재사용하면 패널 히스토리에서 옛 시도가 사라지고,
    // 아직 그 id 를 들고 있는 워커와도 경합한다.
    const jobId = existing ? `${baseId}_r${await this.retryCount(panel.id)}` : baseId;

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

  /** 이 패널에서 지금까지 만든 잡 수. 재시도 id 를 서로 다르게 만드는 데만 쓴다. */
  private async retryCount(panelId: string): Promise<number> {
    return prisma.renderJob.count({ where: { panelId } });
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
