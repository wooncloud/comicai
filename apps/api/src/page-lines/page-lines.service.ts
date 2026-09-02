import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import { defaultPageLineStyle, type PageLineDTO, type PageLineStyle } from '@comicai/types';
import { PagesService } from '../pages/pages.service';

interface PageLineRow {
  id: string;
  pageId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: unknown;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: PageLineRow): PageLineDTO {
  return {
    id: row.id,
    pageId: row.pageId,
    x1: row.x1,
    y1: row.y1,
    x2: row.x2,
    y2: row.y2,
    style: { ...defaultPageLineStyle(), ...((row.style as Partial<PageLineStyle>) ?? {}) },
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CreateInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style?: Partial<PageLineStyle>;
}

export interface PatchInput {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  style?: Partial<PageLineStyle>;
}

@Injectable()
export class PageLinesService {
  constructor(private readonly pages: PagesService) {}

  async list(userId: string, pageId: string): Promise<PageLineDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const rows = await prisma.pageLine.findMany({
      where: { pageId },
      orderBy: { order: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, pageId: string, input: CreateInput): Promise<PageLineDTO> {
    await this.pages.findOwned(userId, pageId);
    const max = await prisma.pageLine.aggregate({
      where: { pageId },
      _max: { order: true },
    });
    const order = (max._max.order ?? -1) + 1;
    const style = { ...defaultPageLineStyle(), ...(input.style ?? {}) };
    const row = await prisma.pageLine.create({
      data: {
        id: newId('pline'),
        pageId,
        x1: input.x1,
        y1: input.y1,
        x2: input.x2,
        y2: input.y2,
        style: style,
        order,
      },
    });
    return toDto(row);
  }

  async patch(userId: string, id: string, input: PatchInput): Promise<PageLineDTO> {
    const owned = await this.assertOwned(userId, id);
    const data: Prisma.PageLineUpdateInput = {};
    if (input.x1 !== undefined) data.x1 = input.x1;
    if (input.y1 !== undefined) data.y1 = input.y1;
    if (input.x2 !== undefined) data.x2 = input.x2;
    if (input.y2 !== undefined) data.y2 = input.y2;
    if (input.style) {
      const merged = { ...defaultPageLineStyle(), ...input.style };
      data.style = merged;
    }
    const row = await prisma.pageLine.update({ where: { id: owned.id }, data });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.assertOwned(userId, id);
    await prisma.pageLine.delete({ where: { id: owned.id } });
  }

  async reorder(userId: string, pageId: string, ids: string[]): Promise<PageLineDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const existing = await prisma.pageLine.findMany({
      where: { pageId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));
    if (ids.length !== existing.length || !ids.every((id) => existingIds.has(id))) {
      throw new ForbiddenException({
        code: 'INVALID_REORDER',
        message: 'ids 목록이 현재 페이지의 직선과 일치하지 않습니다.',
      });
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.pageLine.update({ where: { id }, data: { order: i } })),
    );
    return this.list(userId, pageId);
  }

  private async assertOwned(userId: string, id: string): Promise<{ id: string; pageId: string }> {
    const row = await prisma.pageLine.findUnique({
      where: { id },
      select: {
        id: true,
        pageId: true,
        page: { select: { project: { select: { userId: true } } } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'PAGE_LINE_NOT_FOUND' });
    if (row.page.project.userId !== userId)
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return { id: row.id, pageId: row.pageId };
  }
}
