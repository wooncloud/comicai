import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { PageDTO, ImageRef } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';

interface PageRow {
  id: string;
  projectId: string;
  order: number;
  name: string | null;
  size: unknown;
  background: unknown;
  createdAt: Date;
}

function toDtoBase(row: PageRow): PageDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    name: row.name,
    size: row.size as { w: number; h: number },
    background: (row.background as ImageRef) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PagesService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string, projectId: string): Promise<PageDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.page.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    return Promise.all(rows.map((r) => this.withBackgroundUrl(r)));
  }

  async create(
    userId: string,
    projectId: string,
    size: { w: number; h: number },
  ): Promise<PageDTO> {
    await this.projects.assertOwned(userId, projectId);
    const last = await prisma.page.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const row = await prisma.page.create({
      data: {
        id: newId('page'),
        projectId,
        order: (last?.order ?? -1) + 1,
        size: size,
      },
    });
    return this.withBackgroundUrl(row);
  }

  async get(userId: string, id: string): Promise<PageDTO> {
    await this.findOwned(userId, id);
    const row = await prisma.page.findUniqueOrThrow({ where: { id } });
    return this.withBackgroundUrl(row);
  }

  async patch(
    userId: string,
    id: string,
    patch: { order?: number; size?: { w: number; h: number }; name?: string | null },
  ) {
    await this.findOwned(userId, id);
    const row = await prisma.page.update({
      where: { id },
      data: { ...patch, size: patch.size },
    });
    return this.withBackgroundUrl(row);
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await prisma.page.delete({ where: { id } });
  }

  async findOwned(userId: string, id: string) {
    const row = await prisma.page.findUnique({
      where: { id },
      select: { id: true, projectId: true, project: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    if (row.project.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return row;
  }

  private async withBackgroundUrl(row: PageRow): Promise<PageDTO> {
    const dto = toDtoBase(row);
    const bg = (row.background as ImageRef | null) ?? null;
    dto.backgroundUrl = bg?.storageKey
      ? (await this.storage.presignDownload(bg.storageKey)).url
      : null;
    return dto;
  }
}
