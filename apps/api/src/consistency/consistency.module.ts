import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';
import { RenderModule } from '../render/render.module';
import { ConsistencyController } from './consistency.controller';
import { ConsistencyService } from './consistency.service';

@Module({
  imports: [AuthModule, ProjectsModule, StorageModule, RenderModule],
  controllers: [ConsistencyController],
  providers: [ConsistencyService],
  exports: [ConsistencyService],
})
export class ConsistencyModule {}
