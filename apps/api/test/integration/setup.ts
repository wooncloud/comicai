import 'reflect-metadata';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { CSRF_COOKIE_NAME } from '@comicai/types';
import { AppModule } from '../../src/app.module';
import { applyAppPipeline } from '../../src/bootstrap';

export interface IntegrationContext {
  app: INestApplication;
  pg: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
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
  process.env.SESSION_SECRET = 'test-secret';
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

  const app = await NestFactory.create(AppModule, { logger: false });
  applyAppPipeline(app);
  await app.init();

  return { app, pg, redis };
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
