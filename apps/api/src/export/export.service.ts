import { Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { prisma } from '@comicai/db';
import type { ImageRef, PanelShape } from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { StorageService } from '../storage/storage.service';
import { shapeBoundingBox } from '../common/bbox';
import { buildPanelMaskSvg, buildPanelStrokeSvg } from './panel-mask';

export interface ExportResult {
  storageKey: string;
  url: string;
  expiresAt: string;
  width: number;
  height: number;
  mimeType: string;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly pages: PagesService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 페이지의 모든 패널 currentRender 이미지를 종합해 하나의 페이지 이미지로 합성.
   * dpi는 sharp 출력 density 메타데이터로 반영(인쇄 품질).
   */
  async exportPage(
    userId: string,
    pageId: string,
    format: 'png' | 'jpg',
    dpi = 150,
  ): Promise<ExportResult> {
    const owned = await this.pages.findOwned(userId, pageId);
    const page = await prisma.page.findUnique({
      where: { id: owned.id },
      include: { panels: true },
    });
    if (!page) throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });

    const size = page.size as { w: number; h: number };
    // 페이지가 backgroundColor 를 지정했다면 그것을 base 로. 아니면 jpg=white / png=투명.
    const baseColor =
      page.backgroundColor &&
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(page.backgroundColor)
        ? page.backgroundColor
        : format === 'jpg'
          ? '#ffffff'
          : ({ r: 0, g: 0, b: 0, alpha: 0 } as const);

    const jobIds = page.panels.flatMap((p) => (p.currentRenderId ? [p.currentRenderId] : []));
    const jobs = jobIds.length
      ? await prisma.renderJob.findMany({
          where: { id: { in: jobIds } },
          select: { id: true, resultImage: true },
        })
      : [];
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    const composites = (
      await Promise.all(
        page.panels.map(async (panel) => {
          const shape = panel.shape as unknown as PanelShape;
          const box = shapeBoundingBox(shape);
          const W = Math.round(box.w);
          const H = Math.round(box.h);
          if (W <= 0 || H <= 0) return [];

          const overlays: sharp.OverlayOptions[] = [];

          // 1) 렌더 결과가 있으면 마스크 적용해 깐다.
          const job = panel.currentRenderId ? jobById.get(panel.currentRenderId) : null;
          if (job?.resultImage) {
            const ref = job.resultImage as unknown as ImageRef;
            const { bytes } = await this.storage.getBytes(ref.storageKey);
            const masked = await sharp(Buffer.from(bytes))
              .resize({ width: W, height: H, fit: 'cover' })
              .ensureAlpha()
              .composite([{ input: buildPanelMaskSvg(shape, W, H), blend: 'dest-in' }])
              .png()
              .toBuffer();
            overlays.push({
              input: masked,
              left: Math.round(box.x),
              top: Math.round(box.y),
            });
          }

          // 2) 패널 외곽선(strokeColor/strokeWidth). 렌더 유무와 무관하게 항상 그린다.
          const strokeSvg = buildPanelStrokeSvg(
            shape,
            W,
            H,
            shape.strokeColor ?? '#000000',
            shape.strokeWidth ?? 2,
          );
          if (strokeSvg) {
            overlays.push({
              input: strokeSvg,
              left: Math.round(box.x),
              top: Math.round(box.y),
            });
          }

          return overlays;
        }),
      )
    ).flat();

    let canvas = sharp({
      create: {
        width: Math.round(size.w),
        height: Math.round(size.h),
        channels: 4,
        background: baseColor as never,
      },
    })
      .withMetadata({ density: dpi })
      .composite(composites);
    canvas = format === 'jpg' ? canvas.jpeg({ quality: 92 }) : canvas.png();

    const bytes = await canvas.toBuffer();
    const ref = await this.storage.putImage(
      { kind: 'export', userId, pageId: page.id },
      Uint8Array.from(bytes),
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      Math.round(size.w),
      Math.round(size.h),
    );
    const presigned = await this.storage.presignDownload(ref.storageKey);
    return {
      storageKey: ref.storageKey,
      url: presigned.url,
      expiresAt: presigned.expiresAt,
      width: ref.width,
      height: ref.height,
      mimeType: ref.mimeType,
    };
  }
}
