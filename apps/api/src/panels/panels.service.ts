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

function panelDto(row: {
  id: string;
  pageId: string;
  shape: unknown;
  conti: unknown;
  text: unknown;
  refImages: unknown;
  currentRenderId: string | null;
  history: string[];
}): PanelDTO {
  return {
    id: row.id,
    pageId: row.pageId,
    shape: row.shape as unknown as PanelShape,
    conti: (row.conti as unknown as ImageRef) ?? null,
    text: (row.text as unknown as TipTapDoc) ?? emptyDoc(),
    refImages: (row.refImages as unknown as ImageRef[]) ?? [],
    currentRenderId: row.currentRenderId,
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
    return rows.map(panelDto);
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
    return panelDto(row);
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
    return panelDto(row);
  }

  async history(userId: string, id: string): Promise<RenderJobDTO[]> {
    const panel = await this.assertOwned(userId, id);
    const rows = await prisma.renderJob.findMany({
      where: { panelId: panel.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => ({
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
