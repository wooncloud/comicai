# 보안

> v0.1 — 2026-05-16 — Draft

## API 키 (BYOK) 보호

- 저장: AES-256-GCM 암호화 후 DB. 평문 절대 금지.
- 키 키(KEK)는 `.env`의 `MASTER_KEY` 또는 OS 키링. Docker secrets로 주입.
- 노출 경로:
  - 로그: 마스킹 미들웨어로 정규식 패턴 자동 치환.
  - 에러 응답: API 키 절대 포함하지 않음.
  - 클라이언트 응답: 키 ID와 provider만 노출, ciphertext 미반환.

### 암호화 예시
```ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

function encrypt(plaintext: string, masterKey: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([ct, tag]).toString('base64'), nonce: nonce.toString('base64') };
}
```

## 비밀번호

- 알고리즘: `argon2id` (또는 bcrypt cost ≥ 12).
- 평문 비교 금지. 비교 시 `argon2.verify`만.
- 비밀번호 정책: 최소 10자, 영문+숫자 조합. (강제 특수문자는 비추.)

## 세션

- 쿠키 속성: `HttpOnly`, `Secure`, `SameSite=Lax`.
- 세션 ID: 32바이트 random, Redis 저장.
- TTL: 14일 슬라이딩.
- 로그아웃 시 즉시 무효화.

## CSRF

- SameSite=Lax + state-changing 요청은 더블 서밋 토큰.
- SSE/GET은 면제 가능.

## 입력 검증

- 모든 API 입력은 Zod 스키마 검증.
- 이미지 업로드:
  - MIME 화이트리스트: `image/png`, `image/jpeg`, `image/webp`.
  - 매직바이트 확인 (헤더만 신뢰 금지).
  - 최대 크기: 10MB.
  - 최대 해상도: 4096x4096.

## ToS / 사용자 컨텐츠

- 사용자 업로드 이미지의 저작권 책임은 사용자에게 있음 (ToS 명시).
- NSFW: 모델사 정책에 1차 의존. 명백한 위반은 클라이언트 워닝.
- 신고 기능: Post-MVP.

## 의존성 / 공급망

- `pnpm audit` 주기적 실행.
- 잠금 파일(`pnpm-lock.yaml`) 커밋 필수.
- Dependabot 또는 Renovate로 주기적 업데이트.

## 변경 이력
- 2026-05-16: 초기 작성
