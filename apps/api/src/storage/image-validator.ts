import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp']);
const MIME_BY_FORMAT: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 4096;

export interface ValidatedImage {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * spec 08-security §3 + 09-storage §3 검증 파이프라인.
 * - 매직바이트 기반 포맷 식별 (libvips)
 * - 화이트리스트(png/jpeg/webp) 외 거부
 * - 4096px 초과 시 자동 리사이즈 (downscale only)
 */
export async function validateAndNormalizeImage(buf: Buffer): Promise<ValidatedImage> {
  if (buf.length === 0) {
    throw new BadRequestException({ code: 'UPLOAD_TYPE_NOT_ALLOWED', message: '빈 파일입니다.' });
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException({
      code: 'UPLOAD_TOO_LARGE',
      message: `최대 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB까지 업로드할 수 있습니다.`,
    });
  }

  const meta = await sharp(buf)
    .metadata()
    .catch(() => null);
  if (!meta || !meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new BadRequestException({
      code: 'UPLOAD_TYPE_NOT_ALLOWED',
      message: 'PNG/JPEG/WebP만 허용됩니다.',
    });
  }
  if (!meta.width || !meta.height) {
    throw new BadRequestException({
      code: 'UPLOAD_DIMENSIONS_INVALID',
      message: '이미지 크기를 인식할 수 없습니다.',
    });
  }

  const needsResize = meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION;
  let outBuf: Buffer = buf;
  let outW = meta.width;
  let outH = meta.height;
  if (needsResize) {
    const pipeline = sharp(buf).resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
    outBuf = await pipeline.toBuffer();
    const resized = await sharp(outBuf).metadata();
    outW = resized.width ?? outW;
    outH = resized.height ?? outH;
  }

  return {
    bytes: Uint8Array.from(outBuf),
    mimeType: MIME_BY_FORMAT[meta.format] ?? 'application/octet-stream',
    width: outW,
    height: outH,
  };
}
