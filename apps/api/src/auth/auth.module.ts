import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokensService } from './auth-tokens.service';
import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthTokensService, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard, AuthTokensService],
})
export class AuthModule {}
