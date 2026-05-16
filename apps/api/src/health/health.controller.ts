import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
@SkipThrottle()
export class HealthController {
  @Get('healthz')
  health() {
    return { ok: true, at: new Date().toISOString() };
  }
}
