import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PanelsModule } from '../panels/panels.module';
import { StorageModule } from '../storage/storage.module';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { RenderQueue } from './render.queue';
import { RenderWorker } from './render.worker';
import { SseHub } from './sse.hub';

@Module({
  imports: [AuthModule, PanelsModule, StorageModule],
  controllers: [RenderController],
  providers: [RenderService, RenderQueue, RenderWorker, SseHub],
  exports: [RenderQueue, SseHub, StorageModule],
})
export class RenderModule {}
