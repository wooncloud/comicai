import 'reflect-metadata';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { CSRF_COOKIE_NAME } from '@comicai/types';
import type { PrismaClient } from '@comicai/db';

/*
 * `AppModule` 과 `bootstrap` 은 **동적으로 import 한다.**
 *
 * `@comicai/db` 는 모듈 로드 시점에 `new PrismaClient()` 를 만든다. 정적 import 로
 * 두면 이 파일이 평가되는 순간 — 아직 `startIntegration()` 이 `DATABASE_URL` 을
 * 설정하기 전에 — 클라이언트가 만들어진다.
 *
 * 로컬에서는 그 증상이 보이지 않는다. Prisma 가 저장소 루트의 `.env` 를 스스로
 * 읽어 **개발 DB** 에 붙기 때문이다. 그래서 테스트는 통과하는데 정작 테스트컨테이너가
 * 아닌 개발 데이터베이스를 건드린다. CI 에는 `.env` 가 없어서 거기서만
 * "Environment variable not found: DATABASE_URL" 로 터졌다 — 조용히 틀린 것보다
 * 시끄럽게 틀린 쪽이 나은 사례다.
 */

export interface IntegrationContext {
  app: INestApplication;
  pg: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  /**
   * 테스트컨테이너에 붙은 Prisma 클라이언트.
   *
   * **스펙은 `@comicai/db` 에서 직접 import 하면 안 된다.** 그러면 스펙 모듈이
   * 평가되는 시점(= `startIntegration()` 보다 먼저)에 클라이언트가 만들어지고,
   * 로컬에서는 Prisma 가 저장소 루트 `.env` 를 읽어 **개발 DB** 에 붙는다.
   * 테스트는 통과하는데 개발 데이터를 건드린다.
   */
  prisma: PrismaClient;
}

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DB_PACKAGE = path.join(REPO_ROOT, 'packages/db');

export async function startIntegration(): Promise<IntegrationContext> {
  const [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('comicai_test')
      .withUsername('comicai')
      .withPassword('comicai')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const pgUri = new URL(pg.getConnectionUri());
  pgUri.searchParams.set('schema', 'public');
  process.env.DATABASE_URL = pgUri.toString();
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.MASTER_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.COOKIE_SECURE = '0';
  process.env.RENDER_WORKER_DISABLED = '1';
  // MinIO 컨테이너를 띄우지 않으므로 StorageService의 S3 호출은 즉시 실패시킨다.
  process.env.S3_ENDPOINT = 'http://127.0.0.1:1';
  process.env.STORAGE_AUTO_CREATE_BUCKET = '0';
  // SSE Redis 연결이 필요 없는 테스트에서 publish/subscribe 비활성화.
  process.env.SSE_HUB_DISABLED = '1';

  execSync('npx prisma migrate deploy', {
    cwd: DB_PACKAGE,
    env: { ...process.env },
    stdio: 'inherit',
  });

  const { prisma } = await import('@comicai/db');
  const { AppModule } = await import('../../src/app.module');
  const { applyAppPipeline } = await import('../../src/bootstrap');

  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  applyAppPipeline(app);
  await app.init();

  return { app, pg, redis, prisma };
}

export async function stopIntegration(ctx: IntegrationContext): Promise<void> {
  await ctx.app.close();
  await Promise.all([ctx.redis.stop(), ctx.pg.stop()]);
}

export function csrfFromCookies(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const prefix = `${CSRF_COOKIE_NAME}=`;
  for (const c of cookies) {
    if (c.startsWith(prefix)) {
      const end = c.indexOf(';');
      return decodeURIComponent(end === -1 ? c.slice(prefix.length) : c.slice(prefix.length, end));
    }
  }
  return undefined;
}
