import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { prisma, Prisma } from '@comicai/db';
import {
  IN_PROGRESS_RENDER_STATUSES,
  type ImageRef,
  type ModelId,
  type RenderError,
  type RenderJobDTO,
  type RenderStatus,
  isInProgressRender,
} from '@comicai/types';
import { PanelsService } from '../panels/panels.service';
import { StorageService } from '../storage/storage.service';
import { buildRenderIR } from './ir.builder';
import { RenderQueue, idempotencyKey } from './render.queue';
import { apiError } from '../common/api-error';
import { jsonColumn } from '../common/json-column';
import { TokensService } from '../tokens/tokens.service';
import { ModelCredentials } from './model-credentials';
import { finalizeRenderJob } from './finalize';

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
    private readonly tokens: TokensService,
    private readonly credentials: ModelCredentials,
  ) {}

  /**
   * 잔액을 **큐에 넣기 전에** 본다.
   *
   * 진짜 차감은 워커가 키를 받아 갈 때 원자적으로 일어나므로 이 검사는 권위가 아니다.
   * 그래도 여기 두는 이유는 그게 없으면 사용자가 왕복을 한 번 다 돌고 나서야 "토큰이
   * 없다" 를 알게 되기 때문이다 — 잡이 큐에 들어가 running 까지 갔다가 quota 로 죽고,
   * 화면에는 재시도해도 소용없는 실패가 "잠시 후 다시" 로 뜬다.
   *
   * **비용은 `ModelCredentials` 에게 묻는다.** 여기서 `costOf(model)` 만 보면 "누가
   * 내는가" 규칙이 두 벌이 된다 — 자기 키를 넣은 사용자는 차감되지 않는데도 잔액 0 이면
   * 문 앞에서 막혔다.
   */
  private async assertAffordable(userId: string, cost: number): Promise<void> {
    if (cost <= 0) return;
    const balance = await this.tokens.balance(userId);
    if (balance >= cost) return;
    throw new BadRequestException(
      apiError({
        code: 'INSUFFICIENT_TOKENS',
        message: `토큰이 부족합니다 (필요 ${cost}, 잔액 ${balance}).`,
        // 여분 필드는 예외 필터가 `details` 로 옮겨 담는다 — 여기서 직접 감싸면 이중이 된다.
        required: cost,
        balance,
      }),
    );
  }

  async startRender(
    userId: string,
    panelId: string,
    model: ModelId,
    seed?: number,
  ): Promise<{ jobId: string }> {
    /*
     * 소유권 확인과 잔액 조회는 서로를 기다릴 이유가 없다. 그리고 잔액 검사는 **IR 을
     * 만들기 전에** 해야 한다 — IR 빌드가 이 핸들러에서 가장 비싼 일인데, 토큰이 없는
     * 사용자가 그 비용을 다 치르고 나서야 거절당할 이유가 없다.
     */
    const [panel, chargeable] = await Promise.all([
      this.panels.assertOwned(userId, panelId),
      this.credentials.previewCost(userId, model),
    ]);
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
     * 잔액 검사는 **입력 검증 뒤**다. 앞에 두면 빈 컷을 가진 잔액 0 사용자가 "토큰이
     * 부족합니다" 를 보고 충전하러 갔다가, 돌아와서야 컷이 비었다는 걸 안다 — 고칠 수
     * 있는 문제를 뒤로 숨긴 셈이다. `previewCost` 조회는 위에서 이미 병렬로 끝났다.
     */
    await this.assertAffordable(userId, chargeable);

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
      where: { panelId: panel.id, status: { in: [...IN_PROGRESS_RENDER_STATUSES] } },
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
      // **마감은 한 길로만 간다**(`finalizeRenderJob`). 여기가 네 번째 마감 경로였는데
      // 조건 없이 쓰고 환급도 안 했다 — 지금은 차감이 워커에서 일어나 무해하지만, 차감을
      // 앞당기는 순간 조용히 토큰이 타는 자리가 된다. 그 가능성을 남기지 않는다.
      await finalizeRenderJob(this.tokens, jobId, 'failed', {
        reason: '큐 적재 실패',
        data: { error: error as unknown as Prisma.InputJsonValue },
      }).catch((e: unknown) =>
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
    const resultImage = jsonColumn<ImageRef>(row.resultImage);
    const status = row.status as RenderStatus;
    return {
      id: row.id,
      panelId: row.panelId,
      userId: row.userId,
      model: row.model as ModelId,
      status,
      resultImage,
      resultImageUrl: await this.storage.presignIfSucceeded(resultImage, status),
      error: jsonColumn<RenderError>(row.error),
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
    // 손으로 적은 목록은 timeout·canceled 를 빠뜨려, 이미 끝난 잡을 다시 '취소' 로
    // 덮고 finishedAt 을 바꿨다. 진행 중인 것만 취소할 수 있다.
    if (!isInProgressRender(row.status as RenderStatus)) {
      throw new BadRequestException(
        apiError({ code: 'CONFLICT', message: '이미 완료된 작업입니다.' }),
      );
    }
    /*
     * 조건부다. 위 검사와 이 갱신 사이에 워커가 잡을 끝낼 수 있는데, 무조건 쓰면 성공한
     * 잡을 '취소' 로 덮어 결과 이미지가 화면에서 사라진다. 환급도 그 조건에 묶여 있어야
     * 두 번 나가지 않는다 — 그래서 둘을 한 몸으로 들고 있는 `finalizeRenderJob` 을 쓴다.
     */
    const won = await finalizeRenderJob(this.tokens, id, 'canceled', { reason: '생성 취소' });
    if (!won) {
      throw new BadRequestException(
        apiError({ code: 'CONFLICT', message: '이미 완료된 작업입니다.' }),
      );
    }
  }
}
