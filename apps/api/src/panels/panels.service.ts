import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
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
import { StorageService } from '../storage/storage.service';

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
    history: string[];
  },
  render: RenderRef = { status: null, imageUrl: null },
): PanelDTO {
  return {
    id: row.id,
    pageId: row.pageId,
    shape: row.shape as unknown as PanelShape,
    conti: (row.conti as unknown as ImageRef) ?? null,
    text: (row.text as unknown as TipTapDoc) ?? emptyDoc(),
    refImages: (row.refImages as unknown as ImageRef[]) ?? [],
    currentRenderId: row.currentRenderId,
    currentRenderStatus: render.status,
    currentRenderImageUrl: render.imageUrl,
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
    const rows = await prisma.panel.findMany({ where: { pageId } });
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
    return rows.map((r) => {
      const job = r.currentRenderId ? byId.get(r.currentRenderId) : undefined;
      const key = (job?.resultImage as ImageRef | null)?.storageKey;
      return panelDto(r, {
        status: (job?.status as RenderStatus | undefined) ?? null,
        imageUrl: job?.status === 'succeeded' && key ? (presigned.get(key) ?? null) : null,
      });
    });
  }

  async create(userId: string, pageId: string, shape: PanelShape): Promise<PanelDTO> {
    await this.pages.findOwned(userId, pageId);
    const row = await prisma.panel.create({
      data: {
        id: newId('panel'),
        pageId,
        shape: shape as unknown as object,
        text: emptyDoc() as unknown as object,
      },
    });
    return panelDto(row);
  }

  async patch(userId: string, id: string, patch: { shape?: PanelShape; text?: unknown }) {
    await this.assertOwned(userId, id);
    const data: Record<string, unknown> = {};
    if (patch.shape) data.shape = patch.shape as unknown as object;
    if (patch.text) data.text = patch.text as unknown as object;
    const row = await prisma.panel.update({ where: { id }, data: data as never });
    return panelDto(row, await this.loadRender(row.currentRenderId));
  }

  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await prisma.panel.delete({ where: { id } });
  }

  async appendUpload(userId: string, panelId: string, fileBuffer: Buffer): Promise<PanelDTO> {
    const owned = await this.assertOwned(userId, panelId);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'panel-upload', projectId: owned.projectId, panelId: owned.id },
      fileBuffer,
    );
    const refs = (owned.refImages as unknown as ImageRef[]) ?? [];
    const row = await prisma.panel.update({
      where: { id: owned.id },
      data: { refImages: [...refs, ref] as unknown as object },
    });
    return panelDto(row, await this.loadRender(row.currentRenderId));
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
    if (!job || job.userId !== userId) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND' });
    }
    if (job.status !== 'succeeded') {
      throw new ForbiddenException({
        code: 'CONFLICT',
        message: '성공한 렌더만 복원할 수 있습니다.',
      });
    }
    await this.assertOwned(userId, job.panelId);
    const row = await prisma.panel.update({
      where: { id: job.panelId },
      data: { currentRenderId: job.id },
    });
    return panelDto(row, await this.loadRender(row.currentRenderId));
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
    if (!row) throw new NotFoundException({ code: 'PANEL_NOT_FOUND' });
    if (row.page.project.userId !== userId)
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return {
      id: row.id,
      pageId: row.pageId,
      projectId: row.page.project.id,
      refImages: row.refImages,
    };
  }
}
