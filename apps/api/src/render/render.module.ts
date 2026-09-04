import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PanelsModule } from '../panels/panels.module';
import { StorageModule } from '../storage/storage.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { RenderQueue } from './render.queue';
import { RenderWorker } from './render.worker';
import { SseHub } from './sse.hub';
import { ModelCredentials } from './model-credentials';

@Module({
  imports: [AuthModule, PanelsModule, StorageModule, ApiKeysModule],
  controllers: [RenderController],
  providers: [RenderService, RenderQueue, RenderWorker, SseHub, ModelCredentials],
  exports: [RenderQueue, SseHub, StorageModule, ModelCredentials],
})
export class RenderModule {}
