import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesModule } from '../pages/pages.module';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [PanelsController],
  providers: [PanelsService],
  exports: [PanelsService],
})
export class PanelsModule {}
