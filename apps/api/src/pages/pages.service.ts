import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { PageDTO, ImageRef } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';

function toDto(row: {
  id: string; projectId: string; order: number; size: unknown;
  background: unknown; createdAt: Date;
}): PageDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    size: row.size as { w: number; h: number },
    background: (row.background as unknown as ImageRef) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PagesService {
  constructor(private readonly projects: ProjectsService) {}

  async list(userId: string, projectId: string): Promise<PageDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.page.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, projectId: string, size: { w: number; h: number }): Promise<PageDTO> {
    await this.projects.assertOwned(userId, projectId);
    const last = await prisma.page.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const row = await prisma.page.create({
      data: { id: newId('page'), projectId, order: (last?.order ?? -1) + 1, size: size as unknown as object },
    });
    return toDto(row);
  }

  async patch(userId: string, id: string, patch: { order?: number; size?: { w: number; h: number } }) {
    await this.findOwned(userId, id);
    const row = await prisma.page.update({
      where: { id },
      data: { ...patch, size: patch.size as unknown as object | undefined },
    });
    return toDto(row);
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
    if (!row) throw new NotFoundException({ code: 'resource/not_found' });
    if (row.project.userId !== userId) throw new ForbiddenException({ code: 'auth/forbidden' });
    return row;
  }
}
