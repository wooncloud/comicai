import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokensService } from './auth-tokens.service';
import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokensService, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard, AuthTokensService],
})
export class AuthModule {}
