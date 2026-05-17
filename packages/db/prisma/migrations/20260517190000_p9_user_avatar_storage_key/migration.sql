-- User: 직접 업로드한 아바타의 S3 storage key. 있으면 GET /me에서 presigned URL로 변환.
ALTER TABLE "users" ADD COLUMN "avatar_storage_key" TEXT;
