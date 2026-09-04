import { Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { prisma } from '@comicai/db';
import {
  isHexColor,
  MAX_PAGE_DIMENSION,
  type ImageRef,
  type PageLineStyle,
  type PageTextStyle,
  type PanelShape,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { StorageService } from '../storage/storage.service';
import { shapeBoundingBox } from '../common/bbox';
import { buildPanelMaskSvg, buildPanelStrokeSvg } from './panel-mask';
import { renderSpeechBubbleLayer } from './speech-bubble.render';
import { renderPageTextLayer } from './page-text.render';
import { renderPageLineLayer } from './page-line.render';

/*
 * 패널 합성을 몇 개씩 동시에 할 것인가.
 *
 * 예전에는 `Promise.all` 로 전부 한꺼번에 돌렸다. 그러면 **N개의 원본 바이트와 N개의
 * 마스킹된 PNG 버퍼가 동시에 살아 있는다** — 1536×1024 RGBA 기준 패널당 약 6MB 라
 * 12컷 페이지면 마스킹본만 ~75MB 에 원본이 더 붙는다. 페이지가 커질수록, 동시 export 가
 * 늘수록 그대로 컨테이너 메모리다.
 *
 * 4개면 S3 왕복 지연은 충분히 가려지면서 상주 메모리에 상한이 생긴다.
 */
const PANEL_COMPOSITE_CONCURRENCY = 4;

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

  /** 렌더 결과를 패널 크기로 맞추고 shape 마스크를 씌운 PNG 버퍼. */
  private async maskedPanelImage(
    ref: ImageRef,
    shape: PanelShape,
    w: number,
    h: number,
  ): Promise<Buffer> {
    const { bytes } = await this.storage.getBytes(ref.storageKey);
    return sharp(Buffer.from(bytes))
      .resize({ width: w, height: h, fit: 'cover' })
      .ensureAlpha()
      .composite([{ input: buildPanelMaskSvg(shape, w, h), blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

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
      include: {
        panels: true,
        speechBubbles: { orderBy: { order: 'asc' } },
        pageTexts: { orderBy: { order: 'asc' } },
        pageLines: { orderBy: { order: 'asc' } },
      },
    });
    if (!page) throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });

    const size = page.size as { w: number; h: number };
    /*
     * 스키마가 이제 상한을 걸지만(`PageSizeSchema`), **이미 저장된 행은 그 검증을 거치지
     * 않는다.** 여기서 한 번 더 묶지 않으면 상한 도입 이전에 들어온 거대 페이지 하나로
     * export 프로세스를 죽일 수 있고, 그러면 같은 컨테이너의 다른 요청도 함께 끊긴다.
     */
    const canvasW = clampDimension(size.w);
    const canvasH = clampDimension(size.h);
    // 페이지가 backgroundColor 를 지정했다면 그것을 base 로. 아니면 jpg=white / png=투명.
    const baseColor = isHexColor(page.backgroundColor)
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
      await mapLimit(page.panels, PANEL_COMPOSITE_CONCURRENCY, async (panel) => {
        const shape = panel.shape as unknown as PanelShape;
        const box = shapeBoundingBox(shape);
        // 캔버스보다 큰 패널은 어차피 밖이 잘려 나간다. 그대로 sharp 에 넘기면 패널
        // 하나가 캔버스보다 훨씬 큰 버퍼를 요구한다.
        const W = Math.min(Math.round(box.w), canvasW);
        const H = Math.min(Math.round(box.h), canvasH);
        if (W <= 0 || H <= 0) return [];

        const overlays: sharp.OverlayOptions[] = [];

        // 1) 렌더 결과가 있으면 마스크 적용해 깐다.
        const job = panel.currentRenderId ? jobById.get(panel.currentRenderId) : null;
        if (job?.resultImage) {
          // 원본 바이트는 이 헬퍼 안에서만 산다. 같은 스코프에 두면 마스킹본과 원본이
          // 함께 붙들려 패널당 상주 메모리가 두 배가 된다.
          const masked = await this.maskedPanelImage(
            job.resultImage as unknown as ImageRef,
            shape,
            W,
            H,
          );
          overlays.push({ input: masked, left: Math.round(box.x), top: Math.round(box.y) });
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
          overlays.push({ input: strokeSvg, left: Math.round(box.x), top: Math.round(box.y) });
        }

        return overlays;
      })
    ).flat();

    // 3) 말풍선 — 패널 합성 위. 텍스트는 별도 PageText 레이어에서 처리.
    // 페이지 사이즈와 동일한 단일 SVG 로 모아 합성 (sharp 는 input 이 canvas 보다 크면 거부).
    const bubbleLayer = renderSpeechBubbleLayer(
      page.speechBubbles.map((b) => ({
        variant: b.variant as SpeechBubbleVariant,
        shape: b.shape as unknown as SpeechBubbleShape,
        style: b.style as unknown as SpeechBubbleStyle,
      })),
      canvasW,
      canvasH,
    );
    if (bubbleLayer) composites.push({ input: bubbleLayer, left: 0, top: 0 });

    // 4) 자유 텍스트 — 말풍선 위, 직선 아래.
    const textLayer = renderPageTextLayer(
      page.pageTexts.map((t) => ({
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        text: t.text,
        style: t.style as unknown as PageTextStyle,
      })),
      canvasW,
      canvasH,
    );
    if (textLayer) composites.push({ input: textLayer, left: 0, top: 0 });

    // 5) 자유 직선 — 최상단(가이드/연결선 용도).
    const lineLayer = renderPageLineLayer(
      page.pageLines.map((l) => ({
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        style: l.style as unknown as PageLineStyle,
      })),
      canvasW,
      canvasH,
    );
    if (lineLayer) composites.push({ input: lineLayer, left: 0, top: 0 });

    let canvas = sharp({
      create: {
        width: canvasW,
        height: canvasH,
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
      canvasW,
      canvasH,
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

/** 저장된 페이지 크기를 sharp 가 감당할 범위로 묶는다. 0·음수·NaN 도 여기서 걸러진다. */
function clampDimension(v: number): number {
  const n = Math.round(v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE_DIMENSION);
}

/**
 * 동시 실행 개수를 묶은 `Promise.all`. 결과 순서는 입력 순서 그대로다 —
 * 합성 순서가 곧 z-order 라 뒤섞이면 안 된다.
 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) {
      const item = items[i];
      if (item === undefined) continue;
      out[i] = await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
