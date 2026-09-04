import { Injectable, NotFoundException } from '@nestjs/common';
import { newId, prisma } from '@comicai/db';
import type { ImageRef, ModelId, ProjectDTO } from '@comicai/types';
import { StoragePrefix, StorageService } from '../storage/storage.service';

interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  thumbnail: string | null;
  defaultStyleId: string | null;
  defaultModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDtoBase(p: ProjectRow): ProjectDTO {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    thumbnail: p.thumbnail,
    defaultStyleId: p.defaultStyleId,
    defaultModel: (p.defaultModel as ModelId | null) ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly storage: StorageService) {}

  async list(userId: string): Promise<ProjectDTO[]> {
    const rows = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    /*
     * 폴백 썸네일을 프로젝트마다 조회하면 N+1 이다. `thumbnail` 은 명시적 업로드로만
     * 채워지므로 **기본 상태에서는 전부 폴백**이고, 프로젝트 20개면 21쿼리가 나간다.
     * 썸네일이 없는 것만 모아 한 번에 읽는다.
     */
    const fallbacks = await firstBackgroundByProject(
      rows.filter((r) => !r.thumbnail).map((r) => r.id),
    );
    return Promise.all(rows.map((r) => this.withThumbnailUrl(r, fallbacks)));
  }

  async create(userId: string, name: string): Promise<ProjectDTO> {
    const row = await prisma.project.create({ data: { id: newId('proj'), userId, name } });
    return this.withThumbnailUrl(row);
  }

  async detail(
    userId: string,
    id: string,
  ): Promise<ProjectDTO & { pages: { id: string; order: number }[] }> {
    const row = await prisma.project.findUnique({
      where: { id },
      include: { pages: { select: { id: true, order: true }, orderBy: { order: 'asc' } } },
    });
    // 남의 것도 없는 것도 404 — 이유는 projects.service.ts 의 assertOwned 참고.
    if (row?.userId !== userId) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    const dto = await this.withThumbnailUrl(row);
    return { ...dto, pages: row.pages };
  }

  async patch(
    userId: string,
    id: string,
    patch: {
      name?: string;
      thumbnail?: string | null;
      defaultStyleId?: string | null;
      defaultModel?: ModelId | null;
    },
  ): Promise<ProjectDTO> {
    await this.assertOwned(userId, id);
    const row = await prisma.project.update({ where: { id }, data: patch });
    return this.withThumbnailUrl(row);
  }

  async setThumbnail(userId: string, id: string, fileBuffer: Buffer): Promise<ProjectDTO> {
    const previous = await this.assertOwned(userId, id);
    const ref = await this.storage.storeUploadedImage(
      { kind: 'project-thumbnail', projectId: id },
      fileBuffer,
    );
    const row = await prisma.project.update({
      where: { id },
      data: { thumbnail: ref.storageKey },
    });
    // 교체된 옛 썸네일은 아무도 가리키지 않는다. 지우지 않으면 10번 바꿀 때 9장이 쌓인다.
    // 새 것을 먼저 올리고 나중에 지운다 — 반대 순서면 업로드가 실패했을 때 썸네일이 사라진다.
    if (previous.thumbnail && previous.thumbnail !== ref.storageKey) {
      await this.storage.deleteKeys([previous.thumbnail]);
    }
    return this.withThumbnailUrl(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwned(userId, id);
    // export 결과는 프로젝트가 아니라 사용자 아래에 있어서 프로젝트 prefix 로 안 잡힌다.
    // 페이지가 사라지기 전에 id 를 모아 둔다.
    const pages = await prisma.page.findMany({ where: { projectId: id }, select: { id: true } });
    // DB 를 먼저 지운다. 반대로 하면 S3 삭제 성공 뒤 DB 삭제가 실패했을 때, 화면에는 남아
    // 있는데 이미지가 전부 깨진 프로젝트가 된다.
    await prisma.project.delete({ where: { id } });
    await this.storage.deleteByPrefix(StoragePrefix.project(id));
    for (const page of pages) {
      await this.storage.deleteByPrefix(StoragePrefix.pageExports(userId, page.id));
    }
  }

  async assertOwned(userId: string, id: string): Promise<{ thumbnail: string | null }> {
    const row = await prisma.project.findUnique({
      where: { id },
      select: { userId: true, thumbnail: true },
    });
    /*
     * **남의 것도, 없는 것도 똑같이 404 다.**
     *
     * 예전에는 남의 리소스에 403 을 줬는데, 그러면 "그 id 는 실존하며 남의 것" 이 확인된다.
     * id 를 훑는 것만으로 다른 사용자의 리소스 존재 여부를 열거할 수 있다. 응답이 같아야
     * 아무것도 새지 않는다.
     *
     * 코드는 `RESOURCE_NOT_FOUND` 가 아니라 도메인별 코드를 쓴다 — 웹의 문구 표에서
     * `RESOURCE_NOT_FOUND` 는 null(문구 없음)이라 호출부 문맥에 기대게 되는데,
     * 도메인 코드는 "프로젝트를 찾을 수 없습니다" 처럼 그 자체로 안내가 된다.
     */
    if (row?.userId !== userId) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
    return { thumbnail: row.thumbnail };
  }

  /**
   * thumbnail이 있으면 presigned URL로 매핑.
   * 없으면 첫 페이지의 background를 폴백 썸네일로 사용.
   *
   * `fallbacks` 는 목록 경로가 미리 모아 온 것이다. 단건 경로(create/detail/patch)는
   * 넘기지 않고 그 자리에서 한 번 읽는다 — 어차피 한 건이라 모아 올 것이 없다.
   */
  private async withThumbnailUrl(
    row: ProjectRow,
    fallbacks?: ReadonlyMap<string, ImageRef>,
  ): Promise<ProjectDTO> {
    const dto = toDtoBase(row);
    if (row.thumbnail) {
      dto.thumbnailUrl = (await this.storage.presignDownload(row.thumbnail)).url;
      return dto;
    }
    const bg = (fallbacks ?? (await firstBackgroundByProject([row.id]))).get(row.id);
    dto.thumbnailUrl = bg ? (await this.storage.presignDownload(bg.storageKey)).url : null;
    return dto;
  }
}

/** 프로젝트별 "background 가 있는 첫 페이지" 를 한 번에. 폴백 썸네일의 원본이다. */
async function firstBackgroundByProject(
  projectIds: string[],
): Promise<ReadonlyMap<string, ImageRef>> {
  const map = new Map<string, ImageRef>();
  if (projectIds.length === 0) return map;
  const pages = await prisma.page.findMany({
    where: { projectId: { in: projectIds }, NOT: { background: { equals: null as never } } },
    // distinct 는 정렬한 뒤 프로젝트마다 첫 행을 남긴다. order 가 함께 있어야
    // "첫 페이지" 가 실제로 첫 페이지다.
    orderBy: [{ projectId: 'asc' }, { order: 'asc' }],
    distinct: ['projectId'],
    select: { projectId: true, background: true },
  });
  for (const page of pages) {
    const bg = page.background as ImageRef | null;
    if (bg?.storageKey) map.set(page.projectId, bg);
  }
  return map;
}
