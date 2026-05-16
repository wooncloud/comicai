# syntax=docker/dockerfile:1.7
# 모노레포에서 @comicai/api 와 워커를 같이 실행하는 이미지.
# 빌드 단계에서 워크스페이스 패키지 4개(types/events/db/adapters)와 api를 빌드.

ARG NODE_VERSION=20-alpine

# ---- deps: 의존성만 설치 (캐시 최적화) ----
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache python3 make g++ libc6-compat openssl
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/events/package.json packages/events/
COPY packages/db/package.json packages/db/
COPY packages/adapters/package.json packages/adapters/
RUN pnpm install --frozen-lockfile

# ---- builder: 워크스페이스 패키지 + api 빌드 ----
FROM deps AS builder
WORKDIR /repo
COPY packages packages
COPY apps/api apps/api

# Prisma 클라이언트 생성 + 패키지 빌드 + api nest build
RUN pnpm --filter @comicai/db exec prisma generate \
 && pnpm -r --filter '@comicai/types' --filter '@comicai/events' --filter '@comicai/db' --filter '@comicai/adapters' run build \
 && pnpm --filter @comicai/api exec nest build

# ---- runner: 런타임 ----
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache openssl libc6-compat dumb-init
ENV NODE_ENV=production
WORKDIR /app

# 비루트 사용자
RUN addgroup -g 1001 -S nodejs && adduser -S comicai -u 1001 -G nodejs

# pnpm은 각 워크스페이스에 자체 node_modules 심볼릭 링크를 만든다.
# .pnpm 스토어가 있는 루트 node_modules 와 api/패키지의 로컬 node_modules를 모두 복사.
COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/packages ./packages

USER comicai
EXPOSE 4000

# 기본 cmd는 api 메인. worker는 compose에서 command override.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
