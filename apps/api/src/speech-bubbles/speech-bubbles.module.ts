import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesModule } from '../pages/pages.module';
import { SpeechBubblesController } from './speech-bubbles.controller';
import { SpeechBubblesService } from './speech-bubbles.service';

@Module({
  imports: [AuthModule, PagesModule],
  controllers: [SpeechBubblesController],
  providers: [SpeechBubblesService],
  exports: [SpeechBubblesService],
})
export class SpeechBubblesModule {}
