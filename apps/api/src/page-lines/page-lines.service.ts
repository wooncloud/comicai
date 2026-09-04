import { ForbiddenException, Injectable } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import {
  defaultPageLineStyle,
  type PageLineCreateInput,
  type PageLineDTO,
  type PageLinePatchInput,
  type PageLineStyle,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { isReorderPermutation } from '../common/reorder';
import { mergeStyle } from '../common/style-merge';
import { assertPageChildOwned, nextOrder, PAGE_CHILD_SELECT } from '../common/page-child';
import { apiError } from '../common/api-error';

/** 입력 모양은 Zod 스키마가 단일 출처다 — 여기서 다시 선언하지 않는다. */
type CreateInput = PageLineCreateInput;
type PatchInput = PageLinePatchInput;

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
    style: mergeStyle(defaultPageLineStyle(), row.style as Partial<PageLineStyle> | null),
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
    const order = nextOrder(
      await prisma.pageLine.aggregate({ where: { pageId }, _max: { order: true } }),
    );
    const style = mergeStyle(defaultPageLineStyle(), input.style);
    const row = await prisma.pageLine.create({
      data: {
        id: newId('pline'),
        pageId,
        x1: input.x1,
        y1: input.y1,
        x2: input.x2,
        y2: input.y2,
        style: style as unknown as Prisma.InputJsonValue,
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
      // 기존 값을 빼먹으면 명시하지 않은 필드가 기본값으로 되돌아간다 — style-merge.ts 참고.
      data.style = mergeStyle(
        defaultPageLineStyle(),
        owned.style as Partial<PageLineStyle> | null,
        input.style,
      ) as unknown as Prisma.InputJsonValue;
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
    if (!isReorderPermutation(ids, existingIds)) {
      throw new ForbiddenException(
        apiError({
          code: 'INVALID_REORDER',
          message: 'ids 목록이 현재 페이지의 직선과 일치하지 않습니다.',
        }),
      );
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.pageLine.update({ where: { id }, data: { order: i } })),
    );
    return this.list(userId, pageId);
  }

  private async assertOwned(userId: string, id: string) {
    const row = await prisma.pageLine.findUnique({ where: { id }, select: PAGE_CHILD_SELECT });
    return assertPageChildOwned(row, userId, 'PAGE_LINE_NOT_FOUND');
  }
}
