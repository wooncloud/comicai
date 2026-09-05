import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { TokensController } from '../tokens/tokens.controller';

@Module({
  controllers: [BillingController, TokensController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
