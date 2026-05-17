import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { entityIdPrefix, newId, prisma } from '@comicai/db';
import type { ConsistencyEntityDTO, EntityType, ImageRef } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';

function toDto(
  row: {
    id: string;
    projectId: string;
    type: string;
    name: string;
    aliases: string[];
    description: string;
    refImages: unknown;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
  refImageUrls: string[] = [],
): ConsistencyEntityDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as EntityType,
    name: row.name,
    aliases: row.aliases,
    description: row.description,
    refImages: (row.refImages as ImageRef[]) ?? [],
    refImageUrls,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ConsistencyService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
  ) {}

  async list(
    userId: string,
    projectId: string,
    type?: EntityType,
  ): Promise<ConsistencyEntityDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.consistencyEntity.findMany({
      where: { projectId, ...(type ? { type } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.dtoWithUrls(r)));
  }

  private async dtoWithUrls(row: Parameters<typeof toDto>[0]): Promise<ConsistencyEntityDTO> {
    const refs = (row.refImages as ImageRef[]) ?? [];
    const urls = await Promise.all(
      refs.map(async (ref) => (await this.storage.presignDownload(ref.storageKey)).url),
    );
    return toDto(row, urls);
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
    return this.dtoWithUrls(row);
  }

  async patch(
    userId: string,
    id: string,
    patch: Partial<{ name: string; aliases: string[]; description: string }>,
  ) {
    const owned = await this.findOwned(userId, id);
    const row = await prisma.consistencyEntity.update({
      where: { id: owned.id },
      data: { ...patch, version: { increment: 1 } },
    });
    return this.dtoWithUrls(row);
  }

  async remove(userId: string, id: string) {
    const owned = await this.findOwned(userId, id);
    await prisma.consistencyEntity.delete({ where: { id: owned.id } });
  }

  /** 참조 이미지를 N개 업로드하고 엔티티에 추가. version +1. */
  async appendImages(
    userId: string,
    entityId: string,
    fileBuffers: Buffer[],
  ): Promise<ConsistencyEntityDTO> {
    const owned = await this.findOwned(userId, entityId);
    const newRefs = await Promise.all(
      fileBuffers.map((buf) =>
        this.storage.storeUploadedImage(
          { kind: 'consistency-ref', projectId: owned.projectId, entityId: owned.id },
          buf,
        ),
      ),
    );
    const existing = (owned.refImages as unknown as ImageRef[]) ?? [];
    const row = await prisma.consistencyEntity.update({
      where: { id: owned.id },
      data: {
        refImages: [...existing, ...newRefs],
        version: { increment: 1 },
      },
    });
    return this.dtoWithUrls(row);
  }

  private async findOwned(userId: string, id: string) {
    const row = await prisma.consistencyEntity.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        refImages: true,
        project: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'CONSISTENCY_NOT_FOUND' });
    if (row.project.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return row;
  }
}
