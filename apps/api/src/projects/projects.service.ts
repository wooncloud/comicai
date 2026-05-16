import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { ProjectDTO } from '@comicai/types';

function toDto(p: {
  id: string;
  userId: string;
  name: string;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProjectDTO {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    thumbnail: p.thumbnail,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  async list(userId: string): Promise<ProjectDTO[]> {
    const rows = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, name: string): Promise<ProjectDTO> {
    const row = await prisma.project.create({ data: { id: newId('proj'), userId, name } });
    return toDto(row);
  }

  async detail(
    userId: string,
    id: string,
  ): Promise<ProjectDTO & { pages: { id: string; order: number }[] }> {
    const row = await prisma.project.findUnique({
      where: { id },
      include: { pages: { select: { id: true, order: true }, orderBy: { order: 'asc' } } },
    });
    if (!row) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    if (row.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return { ...toDto(row), pages: row.pages };
  }

  async patch(userId: string, id: string, patch: { name?: string }): Promise<ProjectDTO> {
    await this.assertOwned(userId, id);
    const row = await prisma.project.update({ where: { id }, data: patch });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwned(userId, id);
    await prisma.project.delete({ where: { id } });
  }

  async assertOwned(userId: string, id: string) {
    const row = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
    if (!row) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    if (row.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
  }
}
