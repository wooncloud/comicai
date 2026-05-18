import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesModule } from '../pages/pages.module';
import { PageTextsController } from './page-texts.controller';
import { PageTextsService } from './page-texts.service';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [PageTextsController],
  providers: [PageTextsService],
  exports: [PageTextsService],
})
export class PageTextsModule {}
