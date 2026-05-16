import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { MAX_DIMENSION, MAX_UPLOAD_BYTES, validateAndNormalizeImage } from './image-validator';

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

describe('validateAndNormalizeImage', () => {
  it('accepts a valid PNG within limits', async () => {
    const buf = await makePng(640, 480);
    const r = await validateAndNormalizeImage(buf);
    expect(r.mimeType).toBe('image/png');
    expect(r.width).toBe(640);
    expect(r.height).toBe(480);
  });

  it('rejects empty buffer', async () => {
    await expect(validateAndNormalizeImage(Buffer.alloc(0))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects non-image bytes', async () => {
    await expect(validateAndNormalizeImage(Buffer.from('not an image'))).rejects.toMatchObject({
      response: { code: 'UPLOAD_TYPE_NOT_ALLOWED' },
    });
  });

  it('downscales images larger than MAX_DIMENSION', async () => {
    const buf = await makePng(MAX_DIMENSION + 1000, 100);
    const r = await validateAndNormalizeImage(buf);
    expect(r.width).toBeLessThanOrEqual(MAX_DIMENSION);
    expect(r.height).toBeLessThanOrEqual(MAX_DIMENSION);
  });

  it('rejects files over MAX_UPLOAD_BYTES', async () => {
    // 10MB+1 bytes garbage; size check happens before format detection.
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0xff);
    await expect(validateAndNormalizeImage(oversized)).rejects.toMatchObject({
      response: { code: 'UPLOAD_TOO_LARGE' },
    });
  });
});
