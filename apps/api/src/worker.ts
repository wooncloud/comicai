import 'reflect-metadata';
// main.ts 와 같은 이유로 가장 먼저다 — bootstrap-env.ts 참고.
import { ENV_PROFILE } from './bootstrap-env';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * 워커 전용 엔트리. HTTP 서버는 띄우지 않고 BullMQ 처리만 한다.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.get(Logger).log(`worker ready (설정 그룹 ${ENV_PROFILE.group})`);
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, async () => {
      await app.close();
      process.exit(0);
    });
  }
}

void bootstrap();
