import { Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { UsersModule } from '../../users/users.module';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
