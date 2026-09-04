import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { ulid } from 'ulid';
import type { ImageRef, RenderStatus } from '@comicai/types';
import { validateAndNormalizeImage } from './image-validator';

export type ImageScope =
  | { kind: 'render'; projectId: string; panelId: string; renderJobId: string }
  | { kind: 'consistency-ref'; projectId: string; entityId: string }
  | { kind: 'panel-upload'; projectId: string; panelId: string }
  | { kind: 'panel-conti'; projectId: string; panelId: string }
  | { kind: 'project-thumbnail'; projectId: string }
  | { kind: 'user-avatar'; userId: string }
  | { kind: 'export'; userId: string; pageId: string };

const PRESIGN_TTL_SECONDS = 15 * 60;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  /** 컨테이너 내부에서 사용하는 S3 클라이언트 (put/get 바이트). */
  private client!: S3Client;
  /**
   * presigned URL 발급 전용 클라이언트.
   * 외부(브라우저)가 접근 가능한 host로 서명해야 SigV4 host 헤더 검증을 통과한다.
   * S3_PUBLIC_ENDPOINT가 비어 있으면 내부 endpoint와 동일하게 동작.
   */
  private presignClient!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  /** 버킷에 실제로 닿는지. 헬스체크 전용. */
  async healthPing(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    const publicEndpoint = this.config.get<string>('S3_PUBLIC_ENDPOINT') ?? endpoint;
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'comicai';
    const credentials = {
      accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? 'minioadmin',
      secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? 'minioadmin',
    };
    this.client = new S3Client({ endpoint, region, forcePathStyle: true, credentials });
    this.presignClient = new S3Client({
      endpoint: publicEndpoint,
      region,
      forcePathStyle: true,
      credentials,
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
        this.logger.warn({ err }, 'bucket create failed');
      }
    }
  }

  async putImage(
    scope: ImageScope,
    bytes: Uint8Array,
    mimeType: string,
    width = 0,
    height = 0,
  ): Promise<ImageRef> {
    let w = width;
    let h = height;
    if (!w || !h) {
      try {
        const meta = await sharp(Buffer.from(bytes)).metadata();
        w = meta.width ?? 0;
        h = meta.height ?? 0;
      } catch {
        // sharp는 잘린 이미지에서 throw — caller가 이미 크기 검증을 했으면 0으로 통과.
      }
    }
    const key = buildKey(scope, mimeType);
    await this.put(key, Buffer.from(bytes), mimeType);
    return { storageKey: key, width: w, height: h, mimeType };
  }

  async putThumbnail(originalKey: string, bytes: Uint8Array): Promise<string> {
    const thumbKey = `${originalKey}.thumb.webp`;
    const thumb = await sharp(Buffer.from(bytes))
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await this.put(thumbKey, thumb, 'image/webp');
    return thumbKey;
  }

  async storeUploadedImage(scope: ImageScope, fileBuffer: Buffer): Promise<ImageRef> {
    const validated = await validateAndNormalizeImage(fileBuffer);
    const ref = await this.putImage(
      scope,
      validated.bytes,
      validated.mimeType,
      validated.width,
      validated.height,
    );
    try {
      await this.putThumbnail(ref.storageKey, validated.bytes);
    } catch (err) {
      this.logger.warn({ err, storageKey: ref.storageKey }, 'thumbnail generation failed');
    }
    return ref;
  }

  async presignDownload(key: string): Promise<{ url: string; expiresAt: string }> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.presignClient, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString();
    return { url, expiresAt };
  }

  /** 성공한 렌더의 결과 이미지만 presign. 실패/취소/진행중은 null. */
  async presignIfSucceeded(
    image: ImageRef | null | undefined,
    status: RenderStatus | null | undefined,
  ): Promise<string | null> {
    if (!image || status !== 'succeeded') return null;
    return (await this.presignDownload(image.storageKey)).url;
  }

  async getBytes(key: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    if (r.Body && Symbol.asyncIterator in r.Body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of r.Body as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
    return {
      bytes: Uint8Array.from(Buffer.concat(chunks)),
      mimeType: r.ContentType ?? 'application/octet-stream',
    };
  }

  private async put(key: string, body: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }
}

/*
 * 키는 **prefix 로 지울 수 있어야 한다.** 렌더 결과만 `projects/_/renders/` 로 projectId
 * 자리를 뭉개 두어서, 프로젝트를 지울 때 그 프로젝트의 렌더 결과만 골라낼 방법이 없었다 —
 * 다른 종류(refs/panels/thumbnail)는 전부 projectId 로 묶여 있는데 이것만 예외였다.
 *
 * 렌더 결과를 프로젝트가 아니라 **컷 아래**에 두는 이유: 그래야 프로젝트·페이지·컷
 * 세 단계 삭제가 전부 prefix 하나로 끝난다. 프로젝트 바로 아래 `renders/{jobId}` 였다면
 * 컷 하나를 지울 때 그 컷의 잡 id 를 모아 개별 키를 지워야 하고, 그건 "다 모았는가" 를
 * 매번 다시 증명해야 하는 종류의 코드다. 업로드·콘티가 이미 컷 아래에 있으니 자리도 맞다.
 *
 * 이미 저장된 옛 키를 옮기지는 않는다. 지금까지는 어차피 지우는 경로가 없어 정리 대상이
 * 쌓여 있지 않고(삭제가 처음 생기는 것이 이번 변경이다), 옛 키도 storageKey 를 그대로
 * 들고 있으므로 읽기는 계속 된다. 옮기려면 S3 복사 + DB JSON 갱신이 필요한데, 얻는 것은
 * "이미 미아가 된 오브젝트"뿐이라 값이 없다.
 */
function buildKey(scope: ImageScope, mimeType: string): string {
  const ext = extensionFor(mimeType);
  const id = ulid();
  switch (scope.kind) {
    case 'render':
      return `projects/${scope.projectId}/panels/${scope.panelId}/renders/${scope.renderJobId}.${ext}`;
    case 'consistency-ref':
      return `projects/${scope.projectId}/refs/${scope.entityId}/${id}.${ext}`;
    case 'panel-upload':
      return `projects/${scope.projectId}/panels/${scope.panelId}/upload/${id}.${ext}`;
    case 'panel-conti':
      return `projects/${scope.projectId}/panels/${scope.panelId}/conti/${id}.${ext}`;
    case 'project-thumbnail':
      return `projects/${scope.projectId}/thumbnail/${id}.${ext}`;
    case 'user-avatar':
      return `users/${scope.userId}/avatar/${id}.${ext}`;
    case 'export':
      return `exports/${scope.userId}/${scope.pageId}/${id}.${ext}`;
  }
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}
