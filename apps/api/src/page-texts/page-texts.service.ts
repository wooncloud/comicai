import { ForbiddenException, Injectable } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import {
  coercePageTextFontFamily,
  defaultPageTextStyle,
  type PageTextDTO,
  type PageTextStyle,
  type PageTextCreateInput,
  type PageTextPatchInput,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { isReorderPermutation } from '../common/reorder';
import { mergeStyle } from '../common/style-merge';
import { assertPageChildOwned, nextOrder, PAGE_CHILD_SELECT } from '../common/page-child';
import { apiError } from '../common/api-error';

/** 입력 모양은 Zod 스키마가 단일 출처다 — 여기서 다시 선언하지 않는다. */
type CreateInput = PageTextCreateInput;
type PatchInput = PageTextPatchInput;

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

/**
 * 기본값 채우기 + 제거된 폰트 값 흡수. DB 는 Json 이라 옛 값이 그대로 남아 있다.
 *
 * 형제 모듈(말풍선·직선)과 달리 병합 뒤에 폰트 보정이 한 겹 더 붙는다.
 */
function normalizeStyle(...layers: (Partial<PageTextStyle> | null | undefined)[]): PageTextStyle {
  const merged = mergeStyle(defaultPageTextStyle(), ...layers);
  return { ...merged, fontFamily: coercePageTextFontFamily(merged.fontFamily) };
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
    style: normalizeStyle(row.style as Partial<PageTextStyle> | null),
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
    const order = nextOrder(
      await prisma.pageText.aggregate({ where: { pageId }, _max: { order: true } }),
    );
    const style = normalizeStyle(input.style);
    const row = await prisma.pageText.create({
      data: {
        id: newId('ptext'),
        pageId,
        x: input.x,
        y: input.y,
        w: input.w,
        h: input.h,
        text: input.text ?? '',
        style: style as unknown as Prisma.InputJsonValue,
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
      // 기존 값을 빼먹으면 명시하지 않은 필드가 기본값으로 되돌아간다 — style-merge.ts 참고.
      data.style = normalizeStyle(
        owned.style as Partial<PageTextStyle> | null,
        input.style,
      ) as unknown as Prisma.InputJsonValue;
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
    if (!isReorderPermutation(ids, existingIds)) {
      throw new ForbiddenException(
        apiError({
          code: 'INVALID_REORDER',
          message: 'ids 목록이 현재 페이지의 텍스트와 일치하지 않습니다.',
        }),
      );
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.pageText.update({ where: { id }, data: { order: i } })),
    );
    return this.list(userId, pageId);
  }

  private async assertOwned(userId: string, id: string) {
    const row = await prisma.pageText.findUnique({ where: { id }, select: PAGE_CHILD_SELECT });
    return assertPageChildOwned(row, userId, 'PAGE_TEXT_NOT_FOUND');
  }
}
