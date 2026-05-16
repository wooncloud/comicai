import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesModule } from '../pages/pages.module';
import { StorageModule } from '../storage/storage.module';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';

@Module({
  imports: [AuthModule, PagesModule, StorageModule],
  controllers: [PanelsController],
  providers: [PanelsService],
  exports: [PanelsService],
})
export class PanelsModule {}
