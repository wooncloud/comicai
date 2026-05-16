import { Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { prisma } from '@comicai/db';
import type { ImageRef, PanelShape, RenderJobDTO } from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ExportService {
  constructor(
    private readonly pages: PagesService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 페이지의 모든 패널 currentRender 이미지를 종합해 하나의 페이지 이미지로 합성.
   * 패널 shape의 bounding box에 맞춰 배치, 빈 패널은 회색 placeholder.
   */
  async exportPage(userId: string, pageId: string, format: 'png' | 'jpg') {
    const owned = await this.pages.findOwned(userId, pageId);
    const page = await prisma.page.findUnique({
      where: { id: owned.id },
      include: { panels: true },
    });
    if (!page) throw new NotFoundException({ code: 'resource/not_found' });

    const size = page.size as { w: number; h: number };
    const baseColor = format === 'jpg' ? '#ffffff' : { r: 0, g: 0, b: 0, alpha: 0 };
    const composites: sharp.OverlayOptions[] = [];

    for (const panel of page.panels) {
      const shape = panel.shape as unknown as PanelShape;
      const box = boundingBox(shape);
      if (!panel.currentRenderId) continue;
      const job = await prisma.renderJob.findUnique({ where: { id: panel.currentRenderId } });
      if (!job?.resultImage) continue;
      const ref = job.resultImage as unknown as ImageRef;
      const { bytes } = await this.storage.getBytes(ref.storageKey);
      const resized = await sharp(Buffer.from(bytes))
        .resize({ width: Math.round(box.w), height: Math.round(box.h), fit: 'cover' })
        .toBuffer();
      composites.push({ input: resized, left: Math.round(box.x), top: Math.round(box.y) });
    }

    let canvas = sharp({
      create: {
        width: Math.round(size.w),
        height: Math.round(size.h),
        channels: 4,
        background: baseColor as never,
      },
    }).composite(composites);
    canvas = format === 'jpg' ? canvas.jpeg({ quality: 92 }) : canvas.png();

    const bytes = await canvas.toBuffer();
    const ref = await this.storage.putImage(
      Uint8Array.from(bytes),
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      Math.round(size.w),
      Math.round(size.h),
    );
    return { storageKey: ref.storageKey, mimeType: ref.mimeType, width: ref.width, height: ref.height };
  }

  async history(userId: string, panelId: string): Promise<RenderJobDTO[]> {
    // 위임 — 패널 서비스의 history와 동일. 본 메서드는 사용 안 함.
    void userId; void panelId;
    return [];
  }
}

function boundingBox(shape: PanelShape) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of shape.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
