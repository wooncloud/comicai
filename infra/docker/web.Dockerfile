# syntax=docker/dockerfile:1.7
# @comicai/web (Next.js standalone) 이미지.

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache python3 make g++ libc6-compat
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

FROM deps AS builder
WORKDIR /repo
COPY packages packages
COPY apps/web apps/web

# 브라우저로 노출될 API URL (build-time inline).
# 호스트 머신의 브라우저가 접근하므로 호스트 포트 사용.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# 워크스페이스 패키지 빌드 후 next build
RUN pnpm -r --filter '@comicai/types' run build \
 && pnpm --filter @comicai/web exec next build

# ---- runner: standalone Next 산출물만 ----
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache libc6-compat dumb-init
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# standalone 산출물: apps/web/.next/standalone 안에 node_modules + server.js 가 들어있음
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
