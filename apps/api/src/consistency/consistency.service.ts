import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { entityIdPrefix, newId, prisma } from '@comicai/db';
import type { ConsistencyEntityDTO, EntityType, ImageRef } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';

function toDto(row: {
  id: string; projectId: string; type: string; name: string;
  aliases: string[]; description: string; refImages: unknown;
  version: number; createdAt: Date; updatedAt: Date;
}): ConsistencyEntityDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as EntityType,
    name: row.name,
    aliases: row.aliases,
    description: row.description,
    refImages: (row.refImages as unknown as ImageRef[]) ?? [],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ConsistencyService {
  constructor(private readonly projects: ProjectsService) {}

  async list(userId: string, projectId: string, type?: EntityType): Promise<ConsistencyEntityDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.consistencyEntity.findMany({
      where: { projectId, ...(type ? { type } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async create(
    userId: string,
    projectId: string,
    data: { type: EntityType; name: string; aliases: string[]; description: string },
  ): Promise<ConsistencyEntityDTO> {
    await this.projects.assertOwned(userId, projectId);
    const row = await prisma.consistencyEntity.create({
      data: {
        id: newId(entityIdPrefix(data.type)),
        projectId,
        type: data.type,
        name: data.name,
        aliases: data.aliases,
        description: data.description,
      },
    });
    return toDto(row);
  }

  async patch(userId: string, id: string, patch: Partial<{ name: string; aliases: string[]; description: string }>) {
    const owned = await this.findOwned(userId, id);
    const row = await prisma.consistencyEntity.update({
      where: { id: owned.id },
      data: { ...patch, version: { increment: 1 } },
    });
    return toDto(row);
  }

  async remove(userId: string, id: string) {
    const owned = await this.findOwned(userId, id);
    await prisma.consistencyEntity.delete({ where: { id: owned.id } });
  }

  private async findOwned(userId: string, id: string) {
    const row = await prisma.consistencyEntity.findUnique({
      where: { id },
      select: { id: true, projectId: true, project: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException({ code: 'resource/not_found' });
    if (row.project.userId !== userId) throw new ForbiddenException({ code: 'auth/forbidden' });
    return row;
  }
}
