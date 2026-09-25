import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { prisma } from '@comicai/db';
import {
  isHexColor,
  MAX_PAGE_DIMENSION,
  MAX_STITCH_HEIGHT,
  type EpisodeExportBundle,
  type EpisodeExportMode,
  type ImageRef,
  type PageLineStyle,
  type PageTextStyle,
  type PanelShape,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
  shapeBoundingBox,
} from '@comicai/types';
import { PagesService } from '../pages/pages.service';
import { EpisodesService } from '../episodes/episodes.service';
import { StorageService, type ImageScope } from '../storage/storage.service';
import { buildPanelMaskSvg, buildPanelStrokeSvg } from './panel-mask';
import { renderSpeechBubbleLayer } from './speech-bubble.render';
import { renderPageTextLayer } from './page-text.render';
import { renderPageLineLayer } from './page-line.render';
import { apiError } from '../common/api-error';
import { planStitchSegments } from './stitch-plan';
import { buildZip } from './zip';
import { buildPdf } from './pdf';

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

/** 아직 올리지 않은 페이지 한 장. 이어 붙이기가 이걸 모아 쓴다. */
interface RenderedPage {
  bytes: Buffer;
  width: number;
  height: number;
  /** 이어 붙일 때 빈 자리를 칠할 색. 페이지가 정한 바탕색이거나 형식 기본값이다. */
  baseColor: string | { r: number; g: number; b: number; alpha: number };
}

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
    private readonly episodes: EpisodesService,
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
    const rendered = await this.renderPage(owned.id, format, dpi);
    return this.upload({ kind: 'export', userId, pageId: owned.id }, rendered, format);
  }

  /**
   * 페이지 한 장을 픽셀로 만든다. **올리지는 않는다.**
   *
   * 화 단위 내보내기가 같은 그림을 여러 장 만들어 이어 붙이려면, 올리는 일과
   * 그리는 일이 갈려 있어야 한다. 예전에는 한 함수 안에 붙어 있어서 화를 내보내려면
   * 페이지마다 S3 왕복이 한 번씩 더 생겼다.
   *
   * 소유권은 **호출부가 이미 확인했다고 본다** — 여기서 다시 확인하면 화 내보내기가
   * 페이지 수만큼 같은 질의를 반복한다.
   */
  private async renderPage(
    pageId: string,
    format: 'png' | 'jpg',
    dpi: number,
  ): Promise<RenderedPage> {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        // 나머지 셋과 같이 정렬해야 한다. 정렬이 없으면 Postgres 힙 순서가 나오고,
        // 그 순서는 UPDATE 마다 바뀔 수 있어 **같은 페이지를 두 번 내보내면 겹친 컷의
        // 앞뒤가 달라진다.** 에디터가 보는 순서(order asc)와도 어긋난다.
        panels: { orderBy: { order: 'asc' } },
        speechBubbles: { orderBy: { order: 'asc' } },
        pageTexts: { orderBy: { order: 'asc' } },
        pageLines: { orderBy: { order: 'asc' } },
      },
    });
    if (!page) throw new NotFoundException(apiError({ code: 'PAGE_NOT_FOUND' }));

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
        // 저장된 JSON 은 읽을 때 파싱하지 않는다. strokeColor/strokeWidth 는 Zod
        // 기본값이라 **쓰기 시점에만** 채워지므로 그 필드가 생기기 전 행에는 없다.
        // 캐스트가 그걸 가리므로 여기서 되살린다 — 없으면 SVG 에 undefined 가 실린다.
        const { strokeColor, strokeWidth } = shape as Partial<PanelShape>;
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
          strokeColor ?? '#000000',
          strokeWidth ?? 2,
        );
        if (strokeSvg) {
          overlays.push({ input: strokeSvg, left: Math.round(box.x), top: Math.round(box.y) });
        }

        return overlays;
      })
    ).flat();

    // 3) 말풍선 — 패널 합성 위. 대사는 풍선이 갖고 있어 같은 레이어에서 함께 그린다.
    // 페이지 사이즈와 동일한 단일 SVG 로 모아 합성 (sharp 는 input 이 canvas 보다 크면 거부).
    const bubbleLayer = renderSpeechBubbleLayer(
      page.speechBubbles.map((b) => ({
        variant: b.variant as SpeechBubbleVariant,
        shape: b.shape as unknown as SpeechBubbleShape,
        style: b.style as unknown as SpeechBubbleStyle,
        text: b.text,
        textStyle: b.textStyle as unknown as PageTextStyle,
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

    return { bytes: await canvas.toBuffer(), width: canvasW, height: canvasH, baseColor };
  }

  /**
   * 화 한 편을 내보낸다.
   *
   * `stitch` — 페이지를 **세로로 이어 붙인다**. 웹툰은 한 화가 끊김 없이 흐르는 한
   * 덩어리라, 한 장씩 받으면 올릴 때 다시 이어 붙여야 한다. 너무 길어지면 나누되
   * **페이지 경계에서만** 끊는다 — 그림 한가운데를 자르는 것보다 파일이 하나 느는
   * 편이 낫다.
   *
   * `pages` — 페이지마다 한 장씩. 인스타처럼 넘겨 보는 형식과 출판이 이쪽이다.
   */
  async exportEpisode(
    userId: string,
    episodeId: string,
    format: 'png' | 'jpg',
    dpi = 150,
    mode: EpisodeExportMode = 'stitch',
    bundle: EpisodeExportBundle = 'none',
  ): Promise<ExportResult[]> {
    const episode = await this.episodes.findOwned(userId, episodeId);
    const pages = await prisma.page.findMany({
      where: { episodeId: episode.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (pages.length === 0) {
      throw new BadRequestException(
        apiError({ code: 'EPISODE_EMPTY', message: '이 화에는 페이지가 없습니다.' }),
      );
    }

    const scope = { kind: 'episode-export', userId, episodeId: episode.id } as const;

    if (mode === 'pages') {
      if (bundle === 'none') {
        const out: ExportResult[] = [];
        for (const p of pages) {
          // 한 장씩 차례로. 병렬로 돌리면 페이지 수만큼의 캔버스가 동시에 메모리에 산다.
          out.push(await this.upload(scope, await this.renderPage(p.id, format, dpi), format));
        }
        return out;
      }
      /*
       * 묶어서 낼 때는 그린 것을 모아 둬야 한다 — 봉투도 문서도 전부를 한 번에 받는다.
       * 낱장으로 낼 때는 한 장씩 흘려보내 메모리를 아끼지만, 여기서는 아낄 수 없다.
       */
      const rendered: RenderedPage[] = [];
      for (const p of pages) rendered.push(await this.renderPage(p.id, format, dpi));
      return [await this.bundleUp(scope, rendered, format, dpi, bundle)];
    }

    /*
     * 이어 붙이기.
     *
     * 어디서 끊을지는 **페이지 크기만 보고** 먼저 정한다(`planStitchSegments`) — 그림을
     * 그리기 전에 알 수 있는 값이고, 정작 틀리기 쉬운 곳이라 따로 떼어 테스트로 묶었다.
     *
     * 그린 것은 한 파일 분량만 들고 있는다. 화 전체를 먼저 그려 두고 나누면 페이지
     * 10장이면 그것만으로 수백 MB 가 동시에 메모리에 산다.
     */
    const sizes = await prisma.page.findMany({
      where: { episodeId: episode.id },
      orderBy: { order: 'asc' },
      select: { size: true },
    });
    const heights = sizes.map((p) => clampDimension((p.size as { h: number }).h));
    const segments = planStitchSegments(heights, MAX_STITCH_HEIGHT);

    const stitched: RenderedPage[] = [];
    for (const indices of segments) {
      const rendered: RenderedPage[] = [];
      for (const i of indices) rendered.push(await this.renderPage(pages[i]!.id, format, dpi));
      stitched.push(await stitch(rendered, dpi, format));
    }
    if (bundle !== 'none') return [await this.bundleUp(scope, stitched, format, dpi, bundle)];

    const out: ExportResult[] = [];
    for (const seg of stitched) out.push(await this.upload(scope, seg, format));
    return out;
  }

  /**
   * 여러 장을 한 파일로 묶어 올린다.
   *
   * 결과 타입은 낱장과 같다 — 받는 쪽은 "누르면 받아지는 것" 하나로 보면 된다.
   * 다만 `width`/`height` 는 이미지가 아니라 봉투의 것이 아니므로 0 으로 둔다.
   * 화면은 `mimeType` 을 보고 크기 대신 파일 종류를 보여 준다.
   */
  private async bundleUp(
    scope: ImageScope,
    pages: readonly RenderedPage[],
    format: 'png' | 'jpg',
    dpi: number,
    bundle: Exclude<EpisodeExportBundle, 'none'>,
  ): Promise<ExportResult> {
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const bytes =
      bundle === 'zip'
        ? buildZip(
            pages.map((p, i) => ({
              // 이름은 순서가 드러나야 한다. 파일 탐색기는 이름으로 정렬하므로
              // 자리수를 맞추지 않으면 10 이 2 앞에 온다.
              name: `${String(i + 1).padStart(2, '0')}.${ext}`,
              bytes: p.bytes,
            })),
          )
        : await buildPdf(
            pages.map((p) => ({
              bytes: p.bytes,
              mimeType,
              width: p.width,
              height: p.height,
            })),
            dpi,
          );

    const ref = await this.storage.putImage(
      scope,
      Uint8Array.from(bytes),
      bundle === 'zip' ? 'application/zip' : 'application/pdf',
      0,
      0,
    );
    const presigned = await this.storage.presignDownload(ref.storageKey);
    return {
      storageKey: ref.storageKey,
      url: presigned.url,
      expiresAt: presigned.expiresAt,
      width: 0,
      height: 0,
      mimeType: ref.mimeType,
    };
  }

  private async upload(
    scope: ImageScope,
    rendered: RenderedPage | Promise<RenderedPage>,
    format: 'png' | 'jpg',
  ): Promise<ExportResult> {
    const { bytes, width, height } = await rendered;
    const ref = await this.storage.putImage(
      scope,
      Uint8Array.from(bytes),
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      width,
      height,
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

/**
 * 페이지 여러 장을 세로로 이어 붙인다.
 *
 * 폭이 다르면 **가장 넓은 폭에 맞춰 가운데**에 놓는다. 왼쪽에 붙이면 좁은 페이지가
 * 한쪽으로 쏠려 이어 읽을 때 눈에 띈다. 바탕은 첫 페이지의 바탕색을 쓴다 — 페이지마다
 * 다를 수 있지만, 이어 붙인 한 장의 바탕은 하나여야 한다.
 */
async function stitch(
  pages: readonly RenderedPage[],
  dpi: number,
  format: 'png' | 'jpg',
): Promise<RenderedPage> {
  const first = pages[0]!;
  if (pages.length === 1) return first;

  const width = Math.max(...pages.map((p) => p.width));
  const height = pages.reduce((sum, p) => sum + p.height, 0);

  let top = 0;
  const composites: sharp.OverlayOptions[] = pages.map((p) => {
    const item = { input: p.bytes, left: Math.round((width - p.width) / 2), top };
    top += p.height;
    return item;
  });

  let canvas = sharp({
    create: { width, height, channels: 4, background: first.baseColor as never },
  })
    .withMetadata({ density: dpi })
    .composite(composites);
  canvas = format === 'jpg' ? canvas.jpeg({ quality: 92 }) : canvas.png();
  return { bytes: await canvas.toBuffer(), width, height, baseColor: first.baseColor };
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
