import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, ApiKeysModule],
  controllers: [HealthController],
})
export class AppModule {}
