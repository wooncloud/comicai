# ADR-0005: 이미지 스토리지에 MinIO (S3 호환) 채택, raw Docker volume 미사용

- 상태: Accepted
- 날짜: 2026-05-16

## 컨텍스트
- 사용자 ref 이미지, 콘티, 렌더 결과 등 다량 이미지 저장.
- 향후 클라우드(AWS S3 / Cloudflare R2 / Backblaze B2)로 이전 가능성.

## 결정
**MinIO**를 Docker 컨테이너로 띄워 S3 호환 객체 스토리지로 사용한다. 단순 Docker volume 직접 마운트는 사용하지 않는다.

## 대안
1. **Docker volume 직접** — 단순하지만 클라우드 이전 시 코드 변경 비용 큼.
2. **로컬 파일 시스템 + Nest 정적 서빙** — 권한·URL·만료 처리 직접 구현 필요.
3. **MinIO** — AWS S3 SDK 그대로 사용 → 향후 S3/R2로 환경변수만 바꿔 이전. **채택**.

## 결과
**긍정**:
- AWS SDK 기반 코드 → 환경변수 교체로 클라우드 이전 가능.
- pre-signed URL, 권한, 멀티파트 업로드 기본 제공.
- MinIO Console로 운영 GUI 확보.

**부정**:
- 단순 volume 대비 컨테이너 1개 추가 운영.
- 로컬 디스크 IO를 거치므로 native FS보다 약간 느림.

## 관련
- 스토리지 키 규칙: [`../30-tech/09-storage.md`](../30-tech/09-storage.md)
