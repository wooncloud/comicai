import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import {
  emptyDoc,
  type PanelDTO,
  type PanelShape,
  type ImageRef,
  type TipTapDoc,
  type RenderJobDTO,
  type ModelId,
  type RenderStatus,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { StoragePrefix, StorageService } from '../storage/storage.service';
import { appendPanelRefImages } from '../common/ref-images';
import { apiError } from '../common/api-error';

interface RenderRef {
  status: RenderStatus | null;
  imageUrl: string | null;
}

function panelDto(
  row: {
    id: string;
    pageId: string;
    shape: unknown;
    conti: unknown;
    text: unknown;
    refImages: unknown;
    currentRenderId: string | null;
    styleId: string | null;
    history: string[];
  },
  render: RenderRef = { status: null, imageUrl: null },
  contiUrl: string | null = null,
): PanelDTO {
  return {
    id: row.id,
    pageId: row.pageId,
    shape: row.shape as PanelShape,
    conti: (row.conti as ImageRef) ?? null,
    contiUrl,
    text: (row.text as TipTapDoc) ?? emptyDoc(),
    refImages: (row.refImages as ImageRef[]) ?? [],
    currentRenderId: row.currentRenderId,
    currentRenderStatus: render.status,
    currentRenderImageUrl: render.imageUrl,
    styleId: row.styleId,
    history: row.history,
  };
}

@Injectable()
export class PanelsService {
  constructor(
    private readonly pages: PagesService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string, pageId: string): Promise<PanelDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const rows = await prisma.panel.findMany({ where: { pageId }, orderBy: { order: 'asc' } });
    const renderIds = rows.flatMap((r) => (r.currentRenderId ? [r.currentRenderId] : []));
    const jobs = renderIds.length
      ? await prisma.renderJob.findMany({
          where: { id: { in: renderIds } },
          select: { id: true, status: true, resultImage: true },
        })
      : [];
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const succeededKeys = jobs
      .filter((j) => j.status === 'succeeded')
      .map((j) => (j.resultImage as ImageRef | null)?.storageKey)
      .filter((k): k is string => Boolean(k));
    const presigned = new Map<string, string>(
      await Promise.all(
        succeededKeys.map(
          async (k): Promise<[string, string]> => [k, (await this.storage.presignDownload(k)).url],
        ),
      ),
    );
    return Promise.all(
      rows.map(async (r) => {
        const job = r.currentRenderId ? byId.get(r.currentRenderId) : undefined;
        const key = (job?.resultImage as ImageRef | null)?.storageKey;
        return panelDto(
          r,
          {
            status: (job?.status as RenderStatus | undefined) ?? null,
            imageUrl: job?.status === 'succeeded' && key ? (presigned.get(key) ?? null) : null,
          },
          await this.presignContiUrl(r.conti),
        );
      }),
    );
  }

  private async presignContiUrl(conti: unknown): Promise<string | null> {
    const ref = conti as ImageRef | null;
    if (!ref?.storageKey) return null;
    return (await this.storage.presignDownload(ref.storageKey)).url;
  }

  async create(userId: string, pageId: string, shape: PanelShape): Promise<PanelDTO> {
    await this.pages.findOwned(userId, pageId);
    // 맨 위에 쌓는다. 형제 모듈(말풍선·텍스트·직선)과 같은 채번 방식이다.
    const last = await prisma.panel.findFirst({
      where: { pageId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const row = await prisma.panel.create({
      data: {
        id: newId('panel'),
        pageId,
        order: (last?.order ?? -1) + 1,
        shape: shape as unknown as Prisma.InputJsonValue,
        text: emptyDoc() as unknown as Prisma.InputJsonValue,
      },
    });
    return panelDto(row);
  }

  async patch(
    userId: string,
    id: string,
    patch: {
      shape?: PanelShape;
      stroke?: { strokeColor?: string; strokeWidth?: number };
      text?: unknown;
      styleId?: string | null;
    },
  ) {
    await this.assertOwned(userId, id);
    const data: Record<string, unknown> = {};
    if (patch.shape) data.shape = patch.shape;
    /*
     * 테두리만 바꾸는 경로. 저장된 shape 를 읽어 두 필드만 덮어쓴다.
     *
     * 인스펙터가 shape 전체를 보내던 때는 선택 시점의 낡은 좌표까지 같이 써서,
     * 컷을 옮긴 직후 색을 바꾸면 이동이 취소됐다. 좌표는 캔버스가 쓰고, 테두리는
     * 인스펙터가 쓰되 서로의 필드를 건드리지 않게 나눈다.
     */
    if (patch.stroke) {
      const cur = await prisma.panel.findUnique({ where: { id }, select: { shape: true } });
      if (!cur) throw new NotFoundException(apiError({ code: 'PANEL_NOT_FOUND' }));
      data.shape = { ...(cur.shape as unknown as PanelShape), ...patch.stroke };
    }
    if (patch.text) data.text = patch.text;
    if ('styleId' in patch) data.styleId = patch.styleId ?? null;
    const row = await prisma.panel.update({ where: { id }, data: data as never });
    // 응답에 항상 현재 render 정보까지 채워 보냄 — 누락 시 클라이언트가 panels state를
    // 덮으며 imageUrl을 null로 잃는 회귀 위험(efac8df 사례).
    return panelDto(
      row,
      await this.loadRender(row.currentRenderId),
      await this.presignContiUrl(row.conti),
    );
  }

  async remove(userId: string, id: string) {
    const owned = await this.assertOwned(userId, id);
    // 업로드·콘티·렌더 결과가 전부 이 prefix 아래에 있다. 렌더 잡 행은 FK cascade 가
    // 지운다(schema.prisma:241) — 지우기 전에 잡 id 를 따로 모을 필요가 없다.
    await prisma.panel.delete({ where: { id } });
    await this.storage.deleteByPrefix(StoragePrefix.panel(owned.projectId, owned.id));
  }

  async appendUpload(userId: string, panelId: string, fileBuffer: Buffer): Promise<PanelDTO> {
    const owned = await this.assertOwned(userId, panelId);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'panel-upload', projectId: owned.projectId, panelId: owned.id },
      fileBuffer,
    );
    // 읽어서 통째로 덮어쓰면 동시 업로드가 서로를 지운다 — ref-images.ts 참고.
    await appendPanelRefImages(owned.id, [ref]);
    const row = await prisma.panel.findUniqueOrThrow({ where: { id: owned.id } });
    return panelDto(
      row,
      await this.loadRender(row.currentRenderId),
      await this.presignContiUrl(row.conti),
    );
  }

  async setConti(userId: string, panelId: string, fileBuffer: Buffer): Promise<PanelDTO> {
    const owned = await this.assertOwned(userId, panelId);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'panel-conti', projectId: owned.projectId, panelId: owned.id },
      fileBuffer,
    );
    const row = await prisma.panel.update({
      where: { id: owned.id },
      data: { conti: ref as unknown as Prisma.InputJsonValue },
    });
    return panelDto(
      row,
      await this.loadRender(row.currentRenderId),
      await this.presignContiUrl(row.conti),
    );
  }

  async clearConti(userId: string, panelId: string): Promise<PanelDTO> {
    await this.assertOwned(userId, panelId);
    const row = await prisma.panel.update({
      where: { id: panelId },
      data: { conti: Prisma.JsonNull },
    });
    return panelDto(
      row,
      await this.loadRender(row.currentRenderId),
      await this.presignContiUrl(row.conti),
    );
  }

  /** panel.currentRenderId 기준으로 status + presigned URL을 한 번에 조회. */
  private async loadRender(currentRenderId: string | null): Promise<{
    status: RenderStatus | null;
    imageUrl: string | null;
  }> {
    if (!currentRenderId) return { status: null, imageUrl: null };
    const job = await prisma.renderJob.findUnique({
      where: { id: currentRenderId },
      select: { status: true, resultImage: true },
    });
    if (!job) return { status: null, imageUrl: null };
    const status = job.status as RenderStatus;
    const imageUrl = await this.storage.presignIfSucceeded(
      job.resultImage as ImageRef | null,
      status,
    );
    return { status, imageUrl };
  }

  async history(userId: string, id: string): Promise<RenderJobDTO[]> {
    const panel = await this.assertOwned(userId, id);
    const rows = await prisma.renderJob.findMany({
      where: { panelId: panel.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const items = rows.map((r) => ({
      id: r.id,
      panelId: r.panelId,
      userId: r.userId,
      model: r.model as ModelId,
      status: r.status as RenderStatus,
      resultImage: (r.resultImage as unknown as ImageRef) ?? null,
      error: r.error as unknown as RenderJobDTO['error'],
      attempts: r.attempts,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    }));
    return Promise.all(
      items.map(async (j) => ({
        ...j,
        resultImageUrl: j.resultImage
          ? (await this.storage.presignDownload(j.resultImage.storageKey)).url
          : null,
      })),
    );
  }

  async restoreRender(userId: string, jobId: string): Promise<PanelDTO> {
    const job = await prisma.renderJob.findUnique({
      where: { id: jobId },
      select: { id: true, panelId: true, userId: true, status: true, resultImage: true },
    });
    if (job?.userId !== userId) {
      throw new NotFoundException(apiError({ code: 'RESOURCE_NOT_FOUND' }));
    }
    if (job.status !== 'succeeded') {
      // 403 + code:'CONFLICT' 였다 — 상태 코드와 코드가 서로 다른 말을 했다.
      // 같은 상황을 다루는 render.service.cancel 과 같은 모양으로 맞춘다.
      throw new BadRequestException(
        apiError({
          code: 'CONFLICT',
          message: '성공한 렌더만 복원할 수 있습니다.',
        }),
      );
    }
    await this.assertOwned(userId, job.panelId);
    const row = await prisma.panel.update({
      where: { id: job.panelId },
      data: { currentRenderId: job.id },
    });
    return panelDto(
      row,
      await this.loadRender(row.currentRenderId),
      await this.presignContiUrl(row.conti),
    );
  }

  async assertOwned(
    userId: string,
    id: string,
  ): Promise<{ id: string; pageId: string; projectId: string; refImages: unknown }> {
    const row = await prisma.panel.findUnique({
      where: { id },
      select: {
        id: true,
        pageId: true,
        refImages: true,
        page: { select: { project: { select: { userId: true, id: true } } } },
      },
    });
    // 남의 것도 없는 것도 404 — 이유는 projects.service.ts 의 assertOwned 참고.
    if (row?.page.project.userId !== userId)
      throw new NotFoundException(apiError({ code: 'PANEL_NOT_FOUND' }));
    return {
      id: row.id,
      pageId: row.pageId,
      projectId: row.page.project.id,
      refImages: row.refImages,
    };
  }
}
