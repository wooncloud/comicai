import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';
import { MetricsGuard } from './metrics.guard';
import { Public } from '../auth/public.decorator';

@Controller()
@Public()
@SkipThrottle()
@UseGuards(MetricsGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  async expose(@Res() res: Response) {
    res.setHeader('content-type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
