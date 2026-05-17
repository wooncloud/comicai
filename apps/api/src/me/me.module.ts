import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [MeController],
})
export class MeModule {}
