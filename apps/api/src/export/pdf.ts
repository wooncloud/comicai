import { PDFDocument } from 'pdf-lib';

export interface PdfPage {
  bytes: Uint8Array;
  /** 'image/png' | 'image/jpeg'. 어느 쪽인지에 따라 PDF 안에 담는 방식이 다르다. */
  mimeType: string;
  width: number;
  height: number;
}

/**
 * 이미지 여러 장을 한 PDF 로.
 *
 * **왜 PDF 인가.** 인쇄는 낱장 PNG 보다 PDF 가 맞다 — 인쇄소도 사용자도 한 파일을
 * 기대하고, 페이지 크기가 파일 안에 들어 있어 "몇 %로 출력할까" 를 묻지 않아도 된다.
 *
 * **크기는 dpi 로 환산한다.** PDF 의 단위는 포인트(1/72인치)다. 1240×1754 픽셀을
 * 150dpi 로 찍었다면 595×842pt, 곧 A4 다. 픽셀을 그대로 포인트로 쓰면 A4 로 만든
 * 페이지가 17인치짜리 종이가 된다.
 *
 * 압축은 하지 않는다(`useObjectStreams: false`). 담는 것이 이미 압축된 이미지라
 * 줄어들지 않고, 끄면 결과가 결정적이라 같은 입력에 같은 바이트가 나온다.
 */
export async function buildPdf(pages: readonly PdfPage[], dpi: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const scale = 72 / Math.max(1, dpi);

  for (const page of pages) {
    const image =
      page.mimeType === 'image/png'
        ? await doc.embedPng(page.bytes)
        : await doc.embedJpg(page.bytes);
    const w = page.width * scale;
    const h = page.height * scale;
    const pdfPage = doc.addPage([w, h]);
    // 여백 없이 꽉 채운다. 만화 페이지는 그 자체가 지면이다.
    pdfPage.drawImage(image, { x: 0, y: 0, width: w, height: h });
  }

  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
