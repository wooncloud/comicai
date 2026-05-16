import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ProjectsModule } from './projects/projects.module';
import { ConsistencyModule } from './consistency/consistency.module';
import { PagesModule } from './pages/pages.module';
import { PanelsModule } from './panels/panels.module';
import { RenderModule } from './render/render.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ApiKeysModule,
    ProjectsModule,
    ConsistencyModule,
    PagesModule,
    PanelsModule,
    RenderModule,
    ExportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
