import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma, Prisma } from '@comicai/db';
import {
  defaultSpeechBubbleStyle,
  type SpeechBubbleDTO,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';

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
    style: { ...defaultSpeechBubbleStyle(), ...((row.style as Partial<SpeechBubbleStyle>) ?? {}) },
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CreateInput {
  variant: SpeechBubbleVariant;
  shape: SpeechBubbleShape;
  style?: Partial<SpeechBubbleStyle>;
}

export interface PatchInput {
  variant?: SpeechBubbleVariant;
  shape?: SpeechBubbleShape;
  style?: Partial<SpeechBubbleStyle>;
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
    const max = await prisma.speechBubble.aggregate({
      where: { pageId },
      _max: { order: true },
    });
    const order = (max._max.order ?? -1) + 1;
    const style = { ...defaultSpeechBubbleStyle(), ...(input.style ?? {}) };
    const row = await prisma.speechBubble.create({
      data: {
        id: newId('bubble'),
        pageId,
        variant: input.variant,
        shape: input.shape as unknown as Prisma.InputJsonValue,
        style: style,
        order,
      },
    });
    return toDto(row);
  }

  async patch(userId: string, id: string, input: PatchInput): Promise<SpeechBubbleDTO> {
    const owned = await this.assertOwned(userId, id);
    const data: Prisma.SpeechBubbleUpdateInput = {};
    if (input.variant) data.variant = input.variant;
    if (input.shape) data.shape = input.shape as unknown as Prisma.InputJsonValue;
    if (input.style) {
      const merged = { ...defaultSpeechBubbleStyle(), ...input.style };
      data.style = merged;
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
    if (ids.length !== existing.length || !ids.every((id) => existingIds.has(id))) {
      throw new ForbiddenException({
        code: 'INVALID_REORDER',
        message: 'ids 목록이 현재 페이지의 말풍선과 일치하지 않습니다.',
      });
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.speechBubble.update({ where: { id }, data: { order: i } })),
    );
    return this.list(userId, pageId);
  }

  private async assertOwned(userId: string, id: string): Promise<{ id: string; pageId: string }> {
    const row = await prisma.speechBubble.findUnique({
      where: { id },
      select: {
        id: true,
        pageId: true,
        page: { select: { project: { select: { userId: true } } } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'SPEECH_BUBBLE_NOT_FOUND' });
    if (row.page.project.userId !== userId)
      throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return { id: row.id, pageId: row.pageId };
  }
}
