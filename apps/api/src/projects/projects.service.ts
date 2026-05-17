import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { ImageRef, ProjectDTO } from '@comicai/types';
import { StorageService } from '../storage/storage.service';

interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  thumbnail: string | null;
  defaultStyleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDtoBase(p: ProjectRow): ProjectDTO {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    thumbnail: p.thumbnail,
    defaultStyleId: p.defaultStyleId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly storage: StorageService) {}

  async list(userId: string): Promise<ProjectDTO[]> {
    const rows = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.withThumbnailUrl(r)));
  }

  async create(userId: string, name: string): Promise<ProjectDTO> {
    const row = await prisma.project.create({ data: { id: newId('proj'), userId, name } });
    return this.withThumbnailUrl(row);
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
    const dto = await this.withThumbnailUrl(row);
    return { ...dto, pages: row.pages };
  }

  async patch(
    userId: string,
    id: string,
    patch: { name?: string; thumbnail?: string | null; defaultStyleId?: string | null },
  ): Promise<ProjectDTO> {
    await this.assertOwned(userId, id);
    const row = await prisma.project.update({ where: { id }, data: patch });
    return this.withThumbnailUrl(row);
  }

  async setThumbnail(userId: string, id: string, fileBuffer: Buffer): Promise<ProjectDTO> {
    await this.assertOwned(userId, id);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'project-thumbnail', projectId: id },
      fileBuffer,
    );
    const row = await prisma.project.update({
      where: { id },
      data: { thumbnail: ref.storageKey },
    });
    return this.withThumbnailUrl(row);
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

  /**
   * thumbnail이 있으면 presigned URL로 매핑.
   * 없으면 첫 페이지의 background를 폴백 썸네일로 사용.
   */
  private async withThumbnailUrl(row: ProjectRow): Promise<ProjectDTO> {
    const dto = toDtoBase(row);
    if (row.thumbnail) {
      dto.thumbnailUrl = (await this.storage.presignDownload(row.thumbnail)).url;
      return dto;
    }
    const firstPage = await prisma.page.findFirst({
      where: { projectId: row.id, NOT: { background: { equals: null as never } } },
      orderBy: { order: 'asc' },
      select: { background: true },
    });
    const bg = firstPage?.background as ImageRef | null | undefined;
    if (bg?.storageKey) {
      dto.thumbnailUrl = (await this.storage.presignDownload(bg.storageKey)).url;
    } else {
      dto.thumbnailUrl = null;
    }
    return dto;
  }
}
