# 배포

> v0.1 — 2026-05-16 — Draft

## 토폴로지

- 호스팅: 개인 PC (macOS).
- 외부 노출: Cloudflare Zero Trust Tunnel (`cloudflared`).
- 컨테이너: Docker Compose.

## docker-compose 구성 (개요)

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ...
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  api:
    build: ./apps/api
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      MASTER_KEY: ${MASTER_KEY}
    depends_on: [postgres, redis, minio]

  worker:
    build: ./apps/api
    command: ["node", "dist/worker.js"]
    environment: (api와 동일)
    depends_on: [postgres, redis]

  web:
    build: ./apps/web
    environment:
      NEXT_PUBLIC_API_URL: https://api.example.com
    depends_on: [api]

  cloudflared:
    image: cloudflare/cloudflared
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}

volumes:
  postgres_data:
  minio_data:
```

## 환경 변수

- `MASTER_KEY` — API 키 암호화용 (32바이트 base64).
- `DATABASE_URL`, `REDIS_URL`, `S3_*`.
- `NEXTAUTH_SECRET`, OAuth credentials.
- `CLOUDFLARE_TUNNEL_TOKEN`.

`.env.example` 템플릿 제공. 실제 `.env`는 `.gitignore`.

## 배포 절차

1. `git pull`.
2. `pnpm install`.
3. `pnpm build`.
4. `docker compose build`.
5. `docker compose up -d`.
6. 헬스체크: `curl https://api.example.com/healthz` (200 OK).

## 롤백

- 직전 이미지 태그로 `docker compose up -d --no-deps api worker`.
- DB 마이그레이션 롤백은 별도 매뉴얼 (Prisma).

## 변경 이력
- 2026-05-16: 초기 작성
