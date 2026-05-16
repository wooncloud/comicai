import { Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { prisma } from '@comicai/db';
import type { ImageRef, PanelShape } from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { StorageService } from '../storage/storage.service';
import { shapeBoundingBox } from '../common/bbox';
import { buildPanelMaskSvg } from './panel-mask';

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
    const baseColor = format === 'jpg' ? '#ffffff' : { r: 0, g: 0, b: 0, alpha: 0 };

    const jobIds = page.panels.flatMap((p) => (p.currentRenderId ? [p.currentRenderId] : []));
    const jobs = jobIds.length
      ? await prisma.renderJob.findMany({
          where: { id: { in: jobIds } },
          select: { id: true, resultImage: true },
        })
      : [];
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    const composites = await Promise.all(
      page.panels
        .filter((p) => p.currentRenderId && jobById.get(p.currentRenderId)?.resultImage)
        .map(async (panel) => {
          const job = jobById.get(panel.currentRenderId!)!;
          const ref = job.resultImage as unknown as ImageRef;
          const shape = panel.shape as unknown as PanelShape;
          const box = shapeBoundingBox(shape);
          const W = Math.round(box.w);
          const H = Math.round(box.h);
          const { bytes } = await this.storage.getBytes(ref.storageKey);
          // rect도 마스크가 전체 영역(no-op)이라 분기 없이 한 경로로.
          const masked = await sharp(Buffer.from(bytes))
            .resize({ width: W, height: H, fit: 'cover' })
            .ensureAlpha()
            .composite([{ input: buildPanelMaskSvg(shape, W, H), blend: 'dest-in' }])
            .png()
            .toBuffer();
          return {
            input: masked,
            left: Math.round(box.x),
            top: Math.round(box.y),
          } satisfies sharp.OverlayOptions;
        }),
    );

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
