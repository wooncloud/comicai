import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { PageDTO, ImageRef } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { StoragePrefix, StorageService } from '../storage/storage.service';

interface PageRow {
  id: string;
  projectId: string;
  order: number;
  name: string | null;
  size: unknown;
  background: unknown;
  backgroundColor: string | null;
  createdAt: Date;
}

/**
 * size 는 Json 컬럼이라 타입 캐스팅이 실제 값을 보장하지 않는다. 형태가 깨진 행이
 * 하나 있으면 에디터가 통째로 죽으므로(page-size-select 가 value.w 를 그대로 읽는다)
 * 경계에서 흡수한다. PageCreateSchema 의 기본값과 같은 값을 쓴다.
 */
function toSize(raw: unknown): { w: number; h: number } {
  const s = raw as { w?: unknown; h?: unknown } | null | undefined;
  const w = typeof s?.w === 'number' && s.w > 0 ? s.w : 800;
  const h = typeof s?.h === 'number' && s.h > 0 ? s.h : 1200;
  return { w, h };
}

function toDtoBase(row: PageRow): PageDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    name: row.name,
    size: toSize(row.size),
    background: (row.background as ImageRef) ?? null,
    backgroundColor: row.backgroundColor,
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
    patch: {
      order?: number;
      size?: { w: number; h: number };
      name?: string | null;
      backgroundColor?: string | null;
    },
  ) {
    await this.findOwned(userId, id);
    const row = await prisma.page.update({
      where: { id },
      data: { ...patch, size: patch.size },
    });
    return this.withBackgroundUrl(row);
  }

  async remove(userId: string, id: string) {
    const owned = await this.findOwned(userId, id);
    // 컷의 오브젝트(업로드·콘티·렌더 결과)는 컷 prefix 아래에 있다. 페이지에는 자기
    // prefix 가 없으므로 사라지기 전에 컷 id 를 모아 둔다.
    const panels = await prisma.panel.findMany({ where: { pageId: id }, select: { id: true } });
    await prisma.page.delete({ where: { id } });
    for (const panel of panels) {
      await this.storage.deleteByPrefix(StoragePrefix.panel(owned.projectId, panel.id));
    }
    await this.storage.deleteByPrefix(StoragePrefix.pageExports(userId, id));
  }

  /**
   * 프로젝트 내 페이지를 한 번에 재정렬한다.
   * - pageIds는 새 order(0..N-1) 순서.
   * - 누락된 페이지가 있거나 외부 ID가 섞이면 거부.
   * - PK 제약은 (id) 단일이므로 충돌 우회용 임시 order는 불필요하지만,
   *   동시 reorder 두 건이 섞일 가능성을 줄이려 단일 트랜잭션으로 처리.
   */
  async reorder(userId: string, projectId: string, pageIds: string[]): Promise<PageDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const current = await prisma.page.findMany({
      where: { projectId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((p) => p.id));
    if (pageIds.length !== currentIds.size || !pageIds.every((id) => currentIds.has(id))) {
      throw new BadRequestException({
        code: 'PAGE_REORDER_MISMATCH',
        message: '프로젝트의 모든 페이지를 순서대로 지정해야 합니다.',
      });
    }
    await prisma.$transaction(
      pageIds.map((id, order) => prisma.page.update({ where: { id }, data: { order } })),
    );
    const rows = await prisma.page.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    return Promise.all(rows.map((r) => this.withBackgroundUrl(r)));
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
