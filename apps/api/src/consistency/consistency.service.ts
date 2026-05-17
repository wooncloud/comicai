import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { entityIdPrefix, newId, prisma, Prisma } from '@comicai/db';
import { getAdapter, type AdapterContext } from '@comicai/adapters';
import type { ConsistencyEntityDTO, EntityType, ImageRef, ModelId, RenderIR } from '@comicai/types';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { open } from '../api-keys/crypto';

const GENERATE_TIMEOUT_MS = 60_000;

function toDto(
  row: {
    id: string;
    projectId: string;
    type: string;
    name: string;
    aliases: string[];
    description: string;
    refImages: unknown;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
  refImageUrls: string[] = [],
): ConsistencyEntityDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as EntityType,
    name: row.name,
    aliases: row.aliases,
    description: row.description,
    refImages: (row.refImages as ImageRef[]) ?? [],
    refImageUrls,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ConsistencyService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
  ) {}

  async list(
    userId: string,
    projectId: string,
    type?: EntityType,
  ): Promise<ConsistencyEntityDTO[]> {
    await this.projects.assertOwned(userId, projectId);
    const rows = await prisma.consistencyEntity.findMany({
      where: { projectId, ...(type ? { type } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.dtoWithUrls(r)));
  }

  private async dtoWithUrls(row: Parameters<typeof toDto>[0]): Promise<ConsistencyEntityDTO> {
    const refs = (row.refImages as ImageRef[]) ?? [];
    const urls = await Promise.all(
      refs.map(async (ref) => (await this.storage.presignDownload(ref.storageKey)).url),
    );
    return toDto(row, urls);
  }

  async create(
    userId: string,
    projectId: string,
    data: { type: EntityType; name: string; aliases: string[]; description: string },
  ): Promise<ConsistencyEntityDTO> {
    await this.projects.assertOwned(userId, projectId);
    const row = await prisma.consistencyEntity.create({
      data: {
        id: newId(entityIdPrefix(data.type)),
        projectId,
        type: data.type,
        name: data.name,
        aliases: data.aliases,
        description: data.description,
      },
    });
    return this.dtoWithUrls(row);
  }

  async patch(
    userId: string,
    id: string,
    patch: Partial<{ name: string; aliases: string[]; description: string }>,
  ) {
    const owned = await this.findOwned(userId, id);
    const row = await prisma.consistencyEntity.update({
      where: { id: owned.id },
      data: { ...patch, version: { increment: 1 } },
    });
    return this.dtoWithUrls(row);
  }

  async remove(userId: string, id: string) {
    const owned = await this.findOwned(userId, id);
    // style 엔티티 삭제 시 Project.defaultStyleId / Panel.styleId 참조를 함께 정리한다.
    // FK가 없으므로 dangling reference로 인한 select 폴백 깨짐을 방지하기 위함.
    await prisma.$transaction([
      prisma.project.updateMany({
        where: { id: owned.projectId, defaultStyleId: owned.id },
        data: { defaultStyleId: null },
      }),
      prisma.panel.updateMany({
        where: { styleId: owned.id },
        data: { styleId: null },
      }),
      prisma.consistencyEntity.delete({ where: { id: owned.id } }),
    ]);
  }

  /** 참조 이미지를 N개 업로드하고 엔티티에 추가. version +1. */
  async appendImages(
    userId: string,
    entityId: string,
    fileBuffers: Buffer[],
  ): Promise<ConsistencyEntityDTO> {
    const owned = await this.findOwned(userId, entityId);
    const newRefs = await Promise.all(
      fileBuffers.map((buf) =>
        this.storage.storeUploadedImage(
          { kind: 'consistency-ref', projectId: owned.projectId, entityId: owned.id },
          buf,
        ),
      ),
    );
    const existing = (owned.refImages as unknown as ImageRef[]) ?? [];
    const row = await prisma.consistencyEntity.update({
      where: { id: owned.id },
      data: {
        refImages: [...existing, ...newRefs] as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    return this.dtoWithUrls(row);
  }

  /**
   * AI 모델로 참조 이미지를 1장 생성. 결과는 storage 에만 올라가고 entity.refImages 에는
   * 자동 등록되지 않음 — 클라이언트가 미리보기 후 `attachImage` 로 명시 등록.
   * style 엔티티는 그림체 자체가 다른 패널 결과의 시각적 일관성 기준이라 텍스트→이미지
   * 생성 의미가 다르므로 거부.
   */
  async generateImage(
    userId: string,
    entityId: string,
    prompt: string,
    model: ModelId,
  ): Promise<ImageRef & { url: string; expiresAt: string }> {
    const owned = await this.findOwnedFull(userId, entityId);
    if (owned.type === 'style') {
      throw new BadRequestException({ code: 'CONSISTENCY_GENERATE_UNSUPPORTED' });
    }
    const apiKey = await this.resolveApiKey(userId, model);
    const adapter = getAdapter(model);
    const ir: RenderIR = {
      panelId: `entity-${owned.id}`,
      projectId: owned.projectId,
      styles: [],
      characters: [],
      backgrounds: [],
      worldviews: [],
      contiSketch: null,
      userImages: [],
      userPrompt: prompt,
      aspectRatio: '1:1',
      panelSize: { w: 1024, h: 1024 },
    };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), GENERATE_TIMEOUT_MS);
    const ctx: AdapterContext = { loadReference: (key) => this.storage.getBytes(key) };
    try {
      const req = adapter.buildRequest(ir, apiKey);
      const raw = await adapter.call(req, ac.signal, ctx);
      const stored = await this.storage.putImage(
        { kind: 'consistency-ref', projectId: owned.projectId, entityId: owned.id },
        raw.bytes,
        raw.mimeType,
        raw.width,
        raw.height,
      );
      const presigned = await this.storage.presignDownload(stored.storageKey);
      return { ...stored, url: presigned.url, expiresAt: presigned.expiresAt };
    } catch (err) {
      const classified = adapter.classifyError(err);
      throw new BadRequestException({
        code: 'CONSISTENCY_GENERATE_FAILED',
        category: classified.category,
        message: classified.message,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * generateImage 가 만든 storageKey 를 entity.refImages 에 등록.
   * key prefix 가 (projectId/refs/entityId) 와 일치하지 않으면 거부 — 임의 key 부착 차단.
   */
  async attachImage(
    userId: string,
    entityId: string,
    storageKey: string,
  ): Promise<ConsistencyEntityDTO> {
    const owned = await this.findOwnedFull(userId, entityId);
    const expectedPrefix = `projects/${owned.projectId}/refs/${owned.id}/`;
    if (!storageKey.startsWith(expectedPrefix)) {
      throw new BadRequestException({ code: 'CONSISTENCY_ATTACH_INVALID_KEY' });
    }
    const { bytes, mimeType } = await this.storage.getBytes(storageKey);
    let width = 0;
    let height = 0;
    try {
      const meta = await (await import('sharp')).default(Buffer.from(bytes)).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
    } catch {
      // 생성된 이미지는 어댑터가 검증한 바이트라 비정상일 가능성 낮음.
    }
    const newRef: ImageRef = { storageKey, mimeType, width, height };
    const existing = (owned.refImages as unknown as ImageRef[]) ?? [];
    const row = await prisma.consistencyEntity.update({
      where: { id: owned.id },
      data: {
        refImages: [...existing, newRef] as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    return this.dtoWithUrls(row);
  }

  private async resolveApiKey(userId: string, model: ModelId): Promise<string> {
    if (model === 'mock') return '';
    const provider = model.startsWith('gemini') ? 'gemini' : 'openai';
    const row = await prisma.apiKey.findFirst({
      where: { userId, provider, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new BadRequestException({ code: 'API_KEY_MISSING', provider });
    return open({ ciphertext: row.ciphertext, nonce: row.nonce });
  }

  private async findOwnedFull(userId: string, id: string) {
    const row = await prisma.consistencyEntity.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        type: true,
        refImages: true,
        project: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'CONSISTENCY_NOT_FOUND' });
    if (row.project.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return row;
  }

  private async findOwned(userId: string, id: string) {
    const row = await prisma.consistencyEntity.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        refImages: true,
        project: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'CONSISTENCY_NOT_FOUND' });
    if (row.project.userId !== userId) throw new ForbiddenException({ code: 'RESOURCE_FORBIDDEN' });
    return row;
  }
}
