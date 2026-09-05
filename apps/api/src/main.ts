import 'reflect-metadata';
// 설정을 먼저 세운다. 이 줄이 아래 import 보다 뒤로 가면 일부 모듈이 빈 환경변수를
// 읽고 굳는다 — 자세한 이유는 bootstrap-env.ts.
import { ENV_PROFILE } from './bootstrap-env';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { applyAppPipeline } from './bootstrap';
import { HttpMetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsService } from './metrics/metrics.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  applyAppPipeline(app, {
    extraInterceptors: [new HttpMetricsInterceptor(app.get(MetricsService))],
  });
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  app.get(Logger).log(`api listening on :${port} (설정 그룹 ${ENV_PROFILE.group})`);
}

void bootstrap();
