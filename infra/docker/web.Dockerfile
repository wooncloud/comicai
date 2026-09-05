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
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /repo
COPY packages packages
COPY apps/web apps/web
# next.config.mjs 가 읽는다. 빌드 시점에 필요하다.
COPY env-profile.json ./

# 어느 설정 그룹으로 빌드할지. 비우면 dev(=전부 localhost)로 빌드된다.
ARG APP_ENV=dev
ENV APP_ENV=$APP_ENV
# NEXT_PUBLIC_ 값은 next build 가 번들에 그대로 박아 넣는다. 런타임 환경변수로는
# 바뀌지 않으므로 값을 바꾸려면 다시 빌드해야 한다.
#
# 기본값을 두지 않는다 — 비어 있으면 next.config.mjs 가 프로파일에서 채운다.
# 여기에 `=http://localhost:4000` 같은 기본값을 달면 프로파일을 **항상 덮어** 버려서,
# prod 로 빌드해도 브라우저 번들에는 localhost 가 박힌다.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FEATURE_API_KEYS
ENV NEXT_PUBLIC_FEATURE_API_KEYS=$NEXT_PUBLIC_FEATURE_API_KEYS

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
