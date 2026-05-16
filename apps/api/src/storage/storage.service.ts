import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { ulid } from 'ulid';
import type { ImageRef } from '@comicai/types';

@Injectable()
export class StorageService implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'comicai';
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? 'minioadmin',
      },
    });
    if (process.env.STORAGE_AUTO_CREATE_BUCKET !== '0') {
      await this.ensureBucket();
    }
  }

  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[storage] bucket create failed', err);
      }
    }
  }

  /**
   * 이미지 바이트를 업로드하고 ImageRef 반환.
   * width/height가 0이면 sharp로 자동 계측.
   */
  async putImage(bytes: Uint8Array, mimeType: string, width = 0, height = 0): Promise<ImageRef> {
    let w = width;
    let h = height;
    if (!w || !h) {
      try {
        const meta = await sharp(Buffer.from(bytes)).metadata();
        w = meta.width ?? 0;
        h = meta.height ?? 0;
      } catch {
        // 메타데이터 추출 실패 — 일단 진행
      }
    }
    const key = `renders/${new Date().toISOString().slice(0, 10)}/${ulid()}.${extensionFor(mimeType)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: mimeType,
      }),
    );
    return { storageKey: key, width: w, height: h, mimeType };
  }

  async getBytes(key: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    if (r.Body && Symbol.asyncIterator in r.Body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of r.Body as any) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return { bytes: Uint8Array.from(Buffer.concat(chunks)), mimeType: r.ContentType ?? 'application/octet-stream' };
  }
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}
