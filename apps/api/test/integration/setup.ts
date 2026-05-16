import 'reflect-metadata';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { AppModule } from '../../src/app.module';
import { ZodValidationPipe } from '../../src/common/zod-validation.pipe';
import { ResponseEnvelopeInterceptor } from '../../src/common/response-envelope.interceptor';
import { AllExceptionsFilter } from '../../src/common/all-exceptions.filter';

export interface IntegrationContext {
  app: INestApplication;
  pg: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
}

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DB_PACKAGE = path.join(REPO_ROOT, 'packages/db');

export async function startIntegration(): Promise<IntegrationContext> {
  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('comicai_test')
    .withUsername('comicai')
    .withPassword('comicai')
    .start();
  const redis = await new RedisContainer('redis:7-alpine').start();

  process.env.DATABASE_URL = pg.getConnectionUri() + '?schema=public';
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.MASTER_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.SESSION_SECRET = 'test-secret';
  process.env.COOKIE_SECURE = '0';
  process.env.RENDER_WORKER_DISABLED = '1';

  // Prisma migrate deploy (이미 빌드된 client 사용).
  execSync('npx prisma migrate deploy', {
    cwd: DB_PACKAGE,
    env: { ...process.env },
    stdio: 'inherit',
  });

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1', { exclude: ['healthz'] });
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, pg, redis };
}

export async function stopIntegration(ctx: IntegrationContext): Promise<void> {
  await ctx.app.close();
  await ctx.redis.stop();
  await ctx.pg.stop();
}

export function csrfFromCookies(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of cookies) {
    const m = c.match(/^comicai_csrf=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return undefined;
}
