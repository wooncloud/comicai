import { ForbiddenException, Injectable } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import {
  defaultSpeechBubbleStyle,
  type SpeechBubbleDTO,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
  type SpeechBubbleCreateInput,
  type SpeechBubblePatchInput,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { isReorderPermutation } from '../common/reorder';
import { mergeStyle } from '../common/style-merge';
import { assertPageChildOwned, nextOrder, PAGE_CHILD_SELECT } from '../common/page-child';
import { apiError } from '../common/api-error';

/** 입력 모양은 Zod 스키마가 단일 출처다 — 여기서 다시 선언하지 않는다. */
type CreateInput = SpeechBubbleCreateInput;
type PatchInput = SpeechBubblePatchInput;

interface BubbleRow {
  id: string;
  pageId: string;
  variant: string;
  shape: unknown;
  style: unknown;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: BubbleRow): SpeechBubbleDTO {
  return {
    id: row.id,
    pageId: row.pageId,
    variant: row.variant as SpeechBubbleVariant,
    shape: row.shape as SpeechBubbleShape,
    style: mergeStyle(defaultSpeechBubbleStyle(), row.style as Partial<SpeechBubbleStyle> | null),
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class SpeechBubblesService {
  constructor(private readonly pages: PagesService) {}

  async list(userId: string, pageId: string): Promise<SpeechBubbleDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const rows = await prisma.speechBubble.findMany({
      where: { pageId },
      orderBy: { order: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, pageId: string, input: CreateInput): Promise<SpeechBubbleDTO> {
    await this.pages.findOwned(userId, pageId);
    const order = nextOrder(
      await prisma.speechBubble.aggregate({ where: { pageId }, _max: { order: true } }),
    );
    const style = mergeStyle(defaultSpeechBubbleStyle(), input.style);
    const row = await prisma.speechBubble.create({
      data: {
        id: newId('bubble'),
        pageId,
        variant: input.variant,
        shape: input.shape,
        style: style as unknown as Prisma.InputJsonValue,
        order,
      },
    });
    return toDto(row);
  }

  async patch(userId: string, id: string, input: PatchInput): Promise<SpeechBubbleDTO> {
    const owned = await this.assertOwned(userId, id);
    const data: Prisma.SpeechBubbleUpdateInput = {};
    if (input.variant) data.variant = input.variant;
    if (input.shape) data.shape = input.shape;
    if (input.style) {
      // 기존 값을 빼먹으면 명시하지 않은 필드가 기본값으로 되돌아간다 — style-merge.ts 참고.
      data.style = mergeStyle(
        defaultSpeechBubbleStyle(),
        owned.style as Partial<SpeechBubbleStyle> | null,
        input.style,
      ) as unknown as Prisma.InputJsonValue;
    }
    const row = await prisma.speechBubble.update({ where: { id: owned.id }, data });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.assertOwned(userId, id);
    await prisma.speechBubble.delete({ where: { id: owned.id } });
  }

  async reorder(userId: string, pageId: string, ids: string[]): Promise<SpeechBubbleDTO[]> {
    await this.pages.findOwned(userId, pageId);
    const existing = await prisma.speechBubble.findMany({
      where: { pageId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));
    if (!isReorderPermutation(ids, existingIds)) {
      throw new ForbiddenException(
        apiError({
          code: 'INVALID_REORDER',
          message: 'ids 목록이 현재 페이지의 말풍선과 일치하지 않습니다.',
        }),
      );
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.speechBubble.update({ where: { id }, data: { order: i } })),
    );
    return this.list(userId, pageId);
  }

  private async assertOwned(userId: string, id: string) {
    const row = await prisma.speechBubble.findUnique({ where: { id }, select: PAGE_CHILD_SELECT });
    return assertPageChildOwned(row, userId, 'SPEECH_BUBBLE_NOT_FOUND');
  }
}
