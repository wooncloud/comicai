import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { EpisodeDTO } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { isReorderPermutation } from '../common/reorder';
import { apiError } from '../common/api-error';

interface EpisodeRow {
  id: string;
  projectId: string;
  order: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: EpisodeRow, pageCount: number): EpisodeDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    title: row.title,
    pageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class EpisodesService {
  constructor(private readonly projects: ProjectsService) {}

  async list(userId: string, projectId: string): Promise<EpisodeDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.episode.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { pages: true } } },
    });
    return rows.map((r) => toDto(r, r._count.pages));
  }

  async create(userId: string, projectId: string, title?: string): Promise<EpisodeDTO> {
    await this.projects.assertOwned(userId, projectId);
    const last = await prisma.episode.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const row = await prisma.episode.create({
      data: {
        id: newId('ep'),
        projectId,
        order: (last?.order ?? -1) + 1,
        title: title ?? null,
      },
    });
    return toDto(row, 0);
  }

  /**
   * 페이지를 넣을 화. 없으면 만든다.
   *
   * 프로젝트에는 화가 적어도 하나 있어야 페이지가 존재할 수 있다. 마이그레이션이
   * 기존 프로젝트에 하나씩 만들어 뒀지만, **새로 만든 프로젝트에는 아직 없다** —
   * 프로젝트 생성이 화까지 만들게 하면 "빈 화만 있는 프로젝트" 가 생기므로,
   * 페이지를 처음 추가하는 순간 만든다.
   */
  async ensureLast(userId: string, projectId: string): Promise<EpisodeRow> {
    await this.projects.assertOwned(userId, projectId);
    const last = await prisma.episode.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
    });
    if (last) return last;
    return prisma.episode.create({
      data: { id: newId('ep'), projectId, order: 0, title: null },
    });
  }

  async patch(userId: string, id: string, patch: { title?: string | null }): Promise<EpisodeDTO> {
    await this.findOwned(userId, id);
    const row = await prisma.episode.update({
      where: { id },
      data: patch,
      include: { _count: { select: { pages: true } } },
    });
    return toDto(row, row._count.pages);
  }

  /**
   * 화를 지운다. **그 안의 페이지도 함께 사라진다**(FK cascade).
   *
   * 마지막 화는 막는다. 화가 없으면 페이지를 넣을 곳이 없어, 다음 '페이지 추가' 가
   * 조용히 새 화를 만들게 된다 — 사용자는 지운 적 없는 화가 생겼다고 읽는다.
   */
  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.findOwned(userId, id);
    const count = await prisma.episode.count({ where: { projectId: owned.projectId } });
    if (count <= 1) {
      throw new BadRequestException(
        apiError({
          code: 'EPISODE_LAST',
          message: '마지막 화는 삭제할 수 없습니다.',
        }),
      );
    }
    await prisma.episode.delete({ where: { id } });
  }

  async reorder(userId: string, projectId: string, episodeIds: string[]): Promise<EpisodeDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const current = await prisma.episode.findMany({ where: { projectId }, select: { id: true } });
    if (!isReorderPermutation(episodeIds, new Set(current.map((e) => e.id)))) {
      throw new BadRequestException(
        apiError({
          code: 'EPISODE_REORDER_MISMATCH',
          message: '프로젝트의 모든 화를 순서대로 지정해야 합니다.',
        }),
      );
    }
    await prisma.$transaction(
      episodeIds.map((id, order) => prisma.episode.update({ where: { id }, data: { order } })),
    );
    return this.list(userId, projectId);
  }

  /** 소유권 확인 + 화 행. 남의 것도 없는 것도 404 — 존재 여부를 알려 주지 않는다. */
  async findOwned(userId: string, id: string): Promise<EpisodeRow> {
    const row = await prisma.episode.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });
    if (row?.project.userId !== userId) {
      throw new NotFoundException(apiError({ code: 'EPISODE_NOT_FOUND' }));
    }
    return row;
  }
}
