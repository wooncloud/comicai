import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesModule } from '../pages/pages.module';
import { EpisodesModule } from '../episodes/episodes.module';
import { StorageModule } from '../storage/storage.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [AuthModule, PagesModule, StorageModule, EpisodesModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
