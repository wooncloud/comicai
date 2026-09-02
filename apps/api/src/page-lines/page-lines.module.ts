import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesModule } from '../pages/pages.module';
import { PageLinesController } from './page-lines.controller';
import { PageLinesService } from './page-lines.service';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [PageLinesController],
  providers: [PageLinesService],
  exports: [PageLinesService],
})
export class PageLinesModule {}
