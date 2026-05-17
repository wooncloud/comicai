# 스토리지

> v0.1 — 2026-05-16 — Draft

## 선택: MinIO (S3 호환)

도커 컨테이너로 구동. AWS S3 / R2 / Backblaze로 마이그레이션 시 SDK 그대로 사용 가능.

## 키 네이밍 규칙

```
projects/{projectId}/
  refs/{entityId}/{ulid}.{ext}          # 일관성 정보 ref 이미지
  panels/{panelId}/conti/{ulid}.{ext}   # 콘티 스케치
  panels/{panelId}/upload/{ulid}.{ext}  # 사용자 업로드 (패널 스코프)
  renders/{renderJobId}.{ext}           # 렌더 결과
exports/{userId}/{pageId}/{ulid}.{ext}  # 내보내기 산출물 (TTL 24h)
mock/black-square.png                   # MockAdapter용
```

## 이미지 처리

- 업로드 시:
  - 매직바이트 검증.
  - max 4096px로 자동 리사이즈 (Sharp).
  - 썸네일 자동 생성 (256px) → `{key}.thumb.{ext}`.
- 다운로드: pre-signed URL (15분 TTL).

## 백업

- 일 1회 `mc mirror` 로 외부 클라우드(개인 cloud storage, 예: Backblaze B2)에 복제.
- Postgres `pg_dump` 도 동일 외부 위치.
- 30일 retention.

## 변경 이력

- 2026-05-16: 초기 작성
