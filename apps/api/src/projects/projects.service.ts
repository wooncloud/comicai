import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { ImageRef, ModelId, ProjectDTO } from '@comicai/types';
import { StoragePrefix, StorageService } from '../storage/storage.service';

interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  thumbnail: string | null;
  defaultStyleId: string | null;
  defaultModel: string | null;
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
    defaultModel: (p.defaultModel as ModelId | null) ?? null,
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
    patch: {
      name?: string;
      thumbnail?: string | null;
      defaultStyleId?: string | null;
      defaultModel?: ModelId | null;
    },
  ): Promise<ProjectDTO> {
    await this.assertOwned(userId, id);
    const row = await prisma.project.update({ where: { id }, data: patch });
    return this.withThumbnailUrl(row);
  }

  async setThumbnail(userId: string, id: string, fileBuffer: Buffer): Promise<ProjectDTO> {
    const previous = await this.assertOwned(userId, id);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'project-thumbnail', projectId: id },
      fileBuffer,
    );
    const row = await prisma.project.update({
      where: { id },
      data: { thumbnail: ref.storageKey },
    });
    // 교체된 옛 썸네일은 아무도 가리키지 않는다. 지우지 않으면 10번 바꿀 때 9장이 쌓인다.
    // 새 것을 먼저 올리고 나중에 지운다 — 반대 순서면 업로드가 실패했을 때 썸네일이 사라진다.
    if (previous.thumbnail && previous.thumbnail !== ref.storageKey) {
      await this.storage.deleteKeys([previous.thumbnail]);
    }
    return this.withThumbnailUrl(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwned(userId, id);
    // export 결과는 프로젝트가 아니라 사용자 아래에 있어서 프로젝트 prefix 로 안 잡힌다.
    // 페이지가 사라지기 전에 id 를 모아 둔다.
    const pages = await prisma.page.findMany({ where: { projectId: id }, select: { id: true } });
    // DB 를 먼저 지운다. 반대로 하면 S3 삭제 성공 뒤 DB 삭제가 실패했을 때, 화면에는 남아
    // 있는데 이미지가 전부 깨진 프로젝트가 된다.
    await prisma.project.delete({ where: { id } });
    await this.storage.deleteByPrefix(StoragePrefix.project(id));
    for (const page of pages) {
      await this.storage.deleteByPrefix(StoragePrefix.pageExports(userId, page.id));
    }
  }

  async assertOwned(userId: string, id: string): Promise<{ thumbnail: string | null }> {
    const row = await prisma.project.findUnique({
      where: { id },
      select: { userId: true, thumbnail: true },
    });
    if (!row) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    if (row.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return { thumbnail: row.thumbnail };
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
