import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * 워커 전용 엔트리. HTTP 서버는 띄우지 않고 BullMQ 처리만 한다.
 * api/web과 동일 빌드를 공유하되 main.ts와 분리 실행.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // eslint-disable-next-line no-console
  console.log('[worker] ready');
  // SIGTERM 시 정리
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, async () => {
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap();
