import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import { defaultPageTextStyle, type PageTextDTO, type PageTextStyle } from '@comicai/types';
import { PagesService } from '../pages/pages.service';

interface PageTextRow {
  id: string;
  pageId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: unknown;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: PageTextRow): PageTextDTO {
  return {
    id: row.id,
    pageId: row.pageId,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    text: row.text,
    style: { ...defaultPageTextStyle(), ...((row.style as Partial<PageTextStyle>) ?? {}) },
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CreateInput {
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  style?: Partial<PageTextStyle>;
}

export interface PatchInput {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  style?: Partial<PageTextStyle>;
}

@Injectable()
export class PageTextsService {
  constructor(private readonly pages: PagesService) {}

  async list(userId: string, pageId: string): Promise<PageTextDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const rows = await prisma.pageText.findMany({
      where: { pageId },
      orderBy: { order: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, pageId: string, input: CreateInput): Promise<PageTextDTO> {
    await this.pages.findOwned(userId, pageId);
    const max = await prisma.pageText.aggregate({
      where: { pageId },
      _max: { order: true },
    });
    const order = (max._max.order ?? -1) + 1;
    const style = { ...defaultPageTextStyle(), ...(input.style ?? {}) };
    const row = await prisma.pageText.create({
      data: {
        id: newId('ptext'),
        pageId,
        x: input.x,
        y: input.y,
        w: input.w,
        h: input.h,
        text: input.text ?? '',
        style: style,
        order,
      },
    });
    return toDto(row);
  }

  async patch(userId: string, id: string, input: PatchInput): Promise<PageTextDTO> {
    const owned = await this.assertOwned(userId, id);
    const data: Prisma.PageTextUpdateInput = {};
    if (input.x !== undefined) data.x = input.x;
    if (input.y !== undefined) data.y = input.y;
    if (input.w !== undefined) data.w = input.w;
    if (input.h !== undefined) data.h = input.h;
    if (input.text !== undefined) data.text = input.text;
    if (input.style) {
      const merged = { ...defaultPageTextStyle(), ...input.style };
      data.style = merged;
    }
    const row = await prisma.pageText.update({ where: { id: owned.id }, data });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.assertOwned(userId, id);
    await prisma.pageText.delete({ where: { id: owned.id } });
  }

  async reorder(userId: string, pageId: string, ids: string[]): Promise<PageTextDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const existing = await prisma.pageText.findMany({
      where: { pageId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));
    if (ids.length !== existing.length || !ids.every((id) => existingIds.has(id))) {
      throw new ForbiddenException({
        code: 'INVALID_REORDER',
        message: 'ids 목록이 현재 페이지의 텍스트와 일치하지 않습니다.',
      });
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.pageText.update({ where: { id }, data: { order: i } })),
    );
    return this.list(userId, pageId);
  }

  private async assertOwned(userId: string, id: string): Promise<{ id: string; pageId: string }> {
    const row = await prisma.pageText.findUnique({
      where: { id },
      select: {
        id: true,
        pageId: true,
        page: { select: { project: { select: { userId: true } } } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'PAGE_TEXT_NOT_FOUND' });
    if (row.page.project.userId !== userId)
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return { id: row.id, pageId: row.pageId };
  }
}
