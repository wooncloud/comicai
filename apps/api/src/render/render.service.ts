import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { prisma, Prisma } from '@comicai/db';
import type { ModelId, RenderJobDTO, RenderStatus, ImageRef, RenderError } from '@comicai/types';
import { PanelsService } from '../panels/panels.service';
import { StorageService } from '../storage/storage.service';
import { buildRenderIR } from './ir.builder';
import { RenderQueue, idempotencyKey } from './render.queue';
import { apiError } from '../common/api-error';

/** id 가 이미 있는 행과 부딪혔는가. RenderJob 의 unique 는 primary key 하나뿐이다. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

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
      throw new BadRequestException(
        apiError({
          code: 'RENDER_INVALID_INPUT',
          message: '본문/콘티/참조 이미지 중 하나는 필요합니다.',
        }),
      );
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

    // 이 컷에서 이미 돌고 있는 잡이 있으면 그걸 돌려준다. 더블클릭·중복 제출 방어의
    // 실제 목적이 이것이다. baseId 만 보면 안 된다 — 재시도로 만든 잡은 id 가 달라서
    // 요청할 때마다 새 잡이 쌓인다.
    const active = await prisma.renderJob.findFirst({
      where: { panelId: panel.id, status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active && (active.id === baseId || active.id.startsWith(`${baseId}_r`))) {
      return { jobId: active.id };
    }

    // 끝난 잡이 있으면 새 id 로 다시 만든다. 행을 재사용하면 패널 히스토리에서 옛 시도가
    // 사라지고, 아직 그 id 를 들고 있는 워커와도 경합한다.
    // 접미사는 개수가 아니라 난수다 — 개수를 세면 두 요청이 같은 값을 읽어 충돌한다.
    const taken = await prisma.renderJob.findUnique({
      where: { id: baseId },
      select: { id: true },
    });
    const jobId = taken ? `${baseId}_r${randomBytes(4).toString('hex')}` : baseId;

    try {
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
    } catch (err) {
      /*
       * 두 요청이 위 조회들보다 빨리 들어오면 둘 다 active=null, taken=null 을 읽고
       * 둘 다 baseId 로 create 한다. 진 쪽이 받는 Prisma P2002 는 HttpException 이
       * 아니라 500 INTERNAL_ERROR 로 나갔다 — 이 해시가 막으려던 바로 그 더블클릭에서.
       * 이긴 쪽이 만든 잡을 그대로 받아 간다. enqueue 는 이긴 쪽이 한다.
       */
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.renderJob.findUnique({
        where: { id: jobId },
        select: { id: true },
      });
      if (!existing) throw err;
      return { jobId: existing.id };
    }

    try {
      await this.queue.enqueue({ renderJobId: jobId, userId, model });
    } catch (err) {
      /*
       * 행은 'queued' 인데 BullMQ 잡이 없는 상태로 두면 안 된다. 워커도,
       * worker.on('failed') 안전망도, finalizeOrphan 도 영원히 돌지 않고 stale
       * queued 리퍼도 없다. 다음에 같은 내용으로 다시 누르면 위 active 조회가 이 죽은
       * 행을 찾아 **죽은 jobId 를 돌려주고**, 그 컷은 영구히 '생성 중…' 으로 잠긴다.
       */
      this.logger.error({ err, renderJobId: jobId, model }, 'render enqueue 실패');
      const error: RenderError = {
        category: 'transient',
        message: '렌더 대기열에 넣지 못했습니다.',
      };
      await prisma.renderJob
        .update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error: error as unknown as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        })
        .catch((e: unknown) =>
          // 마감까지 실패하면 좀비 행이 남는다. 최소한 흔적은 남겨야 손으로 찾을 수 있다.
          this.logger.error({ err: e, renderJobId: jobId }, 'enqueue 실패 잡 마감 실패'),
        );
      throw new ServiceUnavailableException(
        apiError({
          code: 'RENDER_ENQUEUE_FAILED',
          message: '잠시 후 다시 시도해 주세요.',
        }),
      );
    }

    await prisma.panel.update({
      where: { id: panel.id },
      data: { currentRenderId: jobId, history: { push: jobId } },
    });
    return { jobId };
  }

  async getJob(userId: string, id: string): Promise<RenderJobDTO> {
    const row = await prisma.renderJob.findUnique({ where: { id } });
    if (row?.userId !== userId) {
      throw new NotFoundException(apiError({ code: 'RESOURCE_NOT_FOUND' }));
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
      throw new NotFoundException(apiError({ code: 'RESOURCE_NOT_FOUND' }));
    }
    if (row.status === 'succeeded' || row.status === 'failed') {
      throw new BadRequestException(
        apiError({ code: 'CONFLICT', message: '이미 완료된 작업입니다.' }),
      );
    }
    await prisma.renderJob.update({
      where: { id },
      data: { status: 'canceled', finishedAt: new Date() },
    });
  }
}
