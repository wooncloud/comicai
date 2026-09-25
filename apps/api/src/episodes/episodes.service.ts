import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { EpisodeDTO } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { StoragePrefix, StorageService } from '../storage/storage.service';
import { isReorderPermutation } from '../common/reorder';
import { pageObjectPrefixes } from '../common/page-objects';
import { apiError } from '../common/api-error';

interface EpisodeRow {
  id: string;
  projectId: string;
  order: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 페이지 수는 싣지 않는다. 화면은 그 화의 페이지 목록을 이미 들고 있어 거기서 센다 —
 * DTO 에 수를 두면 페이지를 더하거나 지울 때마다 화 목록까지 다시 받아야 했다.
 */
function toDto(row: EpisodeRow): EpisodeDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class EpisodesService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string, projectId: string): Promise<EpisodeDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    return this.listOf(projectId);
  }

  /** 소유권을 이미 확인한 호출부용 — reorder 가 같은 확인을 두 번 하지 않게. */
  private async listOf(projectId: string): Promise<EpisodeDTO[]> {
    const rows = await prisma.episode.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
    return rows.map(toDto);
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
    return toDto(row);
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
    return toDto(await prisma.episode.update({ where: { id }, data: patch }));
  }

  /**
   * 화를 지운다. **그 안의 페이지도 함께 사라진다**(FK cascade). 저장소의 그림과
   * 내보내기 결과는 cascade 가 닿지 않으므로 지우기 전에 모아 두었다가 따로 지운다.
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
    const pages = await prisma.page.findMany({ where: { episodeId: id }, select: { id: true } });
    const prefixes = [
      ...(await pageObjectPrefixes(
        userId,
        owned.projectId,
        pages.map((p) => p.id),
      )),
      StoragePrefix.episodeExports(userId, id),
    ];
    await prisma.episode.delete({ where: { id } });
    await this.storage.deleteByPrefixes(prefixes);
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
    return this.listOf(projectId);
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
