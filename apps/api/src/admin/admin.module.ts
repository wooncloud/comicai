import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  // TokensModule 은 전역이라 여기 없어도 주입된다. BillingModule 은 아니다.
  imports: [AuthModule, BillingModule],
  controllers: [AdminController],
})
export class AdminModule {}
