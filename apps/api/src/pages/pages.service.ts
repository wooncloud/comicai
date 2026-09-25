import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { PageDTO, ImageRef } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { EpisodesService } from '../episodes/episodes.service';
import { StoragePrefix, StorageService } from '../storage/storage.service';
import { isReorderPermutation } from '../common/reorder';
import { apiError } from '../common/api-error';
import { jsonColumn } from '../common/json-column';

interface PageRow {
  id: string;
  projectId: string;
  episodeId: string;
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
    episodeId: row.episodeId,
    order: row.order,
    name: row.name,
    size: toSize(row.size),
    background: jsonColumn<ImageRef>(row.background),
    backgroundColor: row.backgroundColor,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PagesService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly episodes: EpisodesService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 프로젝트의 **모든** 페이지. 화 순서 → 화 안의 순서로 정렬한다.
   *
   * 화가 생기기 전에는 `order` 하나로 충분했다. 이제 페이지 순서는 화 안에서만
   * 의미가 있으므로, 프로젝트 전체를 한 줄로 볼 때는 화부터 본다.
   */
  async list(userId: string, projectId: string): Promise<PageDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.page.findMany({
      where: { projectId },
      orderBy: [{ episode: { order: 'asc' } }, { order: 'asc' }],
    });
    return Promise.all(rows.map((r) => this.withBackgroundUrl(r)));
  }

  /** 한 화의 페이지. */
  async listByEpisode(userId: string, episodeId: string): Promise<PageDTO[]> {
    await this.episodes.findOwned(userId, episodeId);
    const rows = await prisma.page.findMany({
      where: { episodeId },
      orderBy: { order: 'asc' },
    });
    return Promise.all(rows.map((r) => this.withBackgroundUrl(r)));
  }

  /**
   * 프로젝트에 페이지를 더한다 — **마지막 화의 뒤**에 붙는다.
   *
   * 화를 고르지 않는 경로다. 연재를 시작하기 전(화가 하나뿐일 때)에는 이게 자연스럽고,
   * 화가 여럿이면 화 화면에서 그 화에 직접 더한다(`createInEpisode`).
   */
  async create(
    userId: string,
    projectId: string,
    size: { w: number; h: number },
  ): Promise<PageDTO> {
    const episode = await this.episodes.ensureLast(userId, projectId);
    return this.appendTo(episode.id, projectId, size);
  }

  /** 지정한 화의 끝에 페이지를 더한다. */
  async createInEpisode(
    userId: string,
    episodeId: string,
    size: { w: number; h: number },
  ): Promise<PageDTO> {
    const episode = await this.episodes.findOwned(userId, episodeId);
    return this.appendTo(episode.id, episode.projectId, size);
  }

  private async appendTo(
    episodeId: string,
    projectId: string,
    size: { w: number; h: number },
  ): Promise<PageDTO> {
    const last = await prisma.page.findFirst({
      where: { episodeId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const row = await prisma.page.create({
      data: {
        id: newId('page'),
        projectId,
        episodeId,
        order: (last?.order ?? -1) + 1,
        size,
      },
    });
    return this.withBackgroundUrl(row);
  }

  async get(userId: string, id: string): Promise<PageDTO> {
    // findOwned 가 페이지 컬럼을 전부 들고 오므로 여기서 같은 행을 다시 읽지 않는다.
    return this.withBackgroundUrl(await this.findOwned(userId, id));
  }

  async patch(
    userId: string,
    id: string,
    patch: {
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
   * **한 화 안에서** 페이지를 재정렬한다.
   *
   * 예전에는 프로젝트 전체가 대상이었다. 화가 생긴 뒤로 페이지 순서는 화 안에서만
   * 의미가 있다 — 프로젝트 전체에 0..N-1 을 다시 매기면 다른 화의 순서까지 건드린다.
   *
   * - pageIds 는 새 order(0..N-1) 순서.
   * - 누락된 페이지가 있거나 다른 화의 ID 가 섞이면 거부.
   * - 동시 reorder 두 건이 섞이지 않게 단일 트랜잭션으로 처리.
   */
  async reorder(userId: string, episodeId: string, pageIds: string[]): Promise<PageDTO[]> {
    await this.episodes.findOwned(userId, episodeId);
    const current = await prisma.page.findMany({ where: { episodeId }, select: { id: true } });
    const currentIds = new Set(current.map((p) => p.id));
    if (!isReorderPermutation(pageIds, currentIds)) {
      throw new BadRequestException(
        apiError({
          code: 'PAGE_REORDER_MISMATCH',
          message: '이 화의 모든 페이지를 순서대로 지정해야 합니다.',
        }),
      );
    }
    await prisma.$transaction(
      pageIds.map((id, order) => prisma.page.update({ where: { id }, data: { order } })),
    );
    const rows = await prisma.page.findMany({ where: { episodeId }, orderBy: { order: 'asc' } });
    return Promise.all(rows.map((r) => this.withBackgroundUrl(r)));
  }

  /**
   * 소유권 확인 + 페이지 행.
   *
   * `select` 로 id/projectId 만 읽고 호출부가 같은 행을 다시 읽으면 왕복이 두 번이다 —
   * `get()` 이 정확히 그랬고, 에디터가 페이지를 열 때마다 발생했다. 페이지 행은 작으므로
   * 소유권만 필요한 호출부(panels·말풍선·텍스트·직선)가 조금 더 읽는 비용보다,
   * 왕복 하나를 없애는 쪽이 낫다.
   */
  async findOwned(userId: string, id: string): Promise<PageRow & { project: { userId: string } }> {
    const row = await prisma.page.findUnique({
      where: { id },
      include: { project: { select: { userId: true } } },
    });
    // 남의 것도 없는 것도 404 — 이유는 projects.service.ts 의 assertOwned 참고.
    if (row?.project.userId !== userId)
      throw new NotFoundException(apiError({ code: 'PAGE_NOT_FOUND' }));
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
