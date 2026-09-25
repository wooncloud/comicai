import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { buildPdf } from './pdf';

/*
 * 여기서 틀리면 **인쇄소에 잘못된 크기로 넘어간다.** 화면에서는 멀쩡해 보이는데
 * A4 로 만든 페이지가 17인치 종이로 나오는 식이라, 뽑아 보기 전에는 모른다.
 */
async function solidJpg(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: '#cc3344' },
  })
    .jpeg()
    .toBuffer();
  return Uint8Array.from(buf);
}

async function solidPng(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return Uint8Array.from(buf);
}

describe('buildPdf', () => {
  it('페이지 수가 넘긴 장 수와 같다', async () => {
    const img = await solidJpg(100, 200);
    const pdf = await buildPdf(
      [
        { bytes: img, mimeType: 'image/jpeg', width: 100, height: 200 },
        { bytes: img, mimeType: 'image/jpeg', width: 100, height: 200 },
      ],
      150,
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const read = await PDFDocument.load(pdf);
    expect(read.getPageCount()).toBe(2);
  });

  /*
   * 150dpi 로 찍은 1240×1754 는 A4(595×842pt)다. 픽셀을 그대로 포인트로 쓰면
   * 1240×1754pt = 17×24인치가 되어, 인쇄소가 축소해 뽑거나 되묻는다.
   */
  it('dpi 로 환산해 A4 가 A4 로 나온다', async () => {
    const img = await solidJpg(1240, 1754);
    const pdf = await buildPdf(
      [{ bytes: img, mimeType: 'image/jpeg', width: 1240, height: 1754 }],
      150,
    );
    const size = (await PDFDocument.load(pdf)).getPage(0).getSize();
    expect(Math.round(size.width)).toBe(595);
    expect(Math.round(size.height)).toBe(842);
  });

  it('72dpi 면 픽셀이 곧 포인트다', async () => {
    const img = await solidJpg(300, 400);
    const pdf = await buildPdf(
      [{ bytes: img, mimeType: 'image/jpeg', width: 300, height: 400 }],
      72,
    );
    const size = (await PDFDocument.load(pdf)).getPage(0).getSize();
    expect(Math.round(size.width)).toBe(300);
    expect(Math.round(size.height)).toBe(400);
  });

  it('PNG 도 담는다 — 내보내기 기본 형식이다', async () => {
    const pdf = await buildPdf(
      [{ bytes: await solidPng(120, 90), mimeType: 'image/png', width: 120, height: 90 }],
      72,
    );
    const read = await PDFDocument.load(pdf);
    expect(read.getPageCount()).toBe(1);
    expect(Math.round(read.getPage(0).getSize().width)).toBe(120);
  });

  it('페이지마다 크기가 다를 수 있다', async () => {
    const pdf = await buildPdf(
      [
        { bytes: await solidJpg(100, 100), mimeType: 'image/jpeg', width: 100, height: 100 },
        { bytes: await solidJpg(200, 50), mimeType: 'image/jpeg', width: 200, height: 50 },
      ],
      72,
    );
    const read = await PDFDocument.load(pdf);
    expect(read.getPage(0).getSize().height).toBeCloseTo(100, 0);
    expect(read.getPage(1).getSize().height).toBeCloseTo(50, 0);
  });
});
