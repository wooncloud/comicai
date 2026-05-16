import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RenderStartSchema, type ModelId } from '@comicai/types';
import { RenderService } from './render.service';
import { SseHub } from './sse.hub';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

class StartDto {
  static zodSchema = RenderStartSchema;
  model!: ModelId;
  seed?: number;
}

@Controller()
@UseGuards(SessionGuard)
export class RenderController {
  constructor(
    private readonly svc: RenderService,
    private readonly hub: SseHub,
  ) {}

  @Post('panels/:id/render')
  @HttpCode(202)
  start(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: StartDto) {
    return this.svc.startRender(req.user.id, id, body.model);
  }

  @Get('render-jobs/:id')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.getJob(req.user.id, id);
  }

  @Post('render-jobs/:id/cancel')
  @HttpCode(204)
  async cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.cancel(req.user.id, id);
  }

  @Get('render-jobs/:id/events')
  async events(@Req() req: AuthedRequest, @Param('id') id: string, @Res() res: Response) {
    // 권한 + 존재 확인
    await this.svc.getJob(req.user.id, id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    this.hub.subscribe(id, res);
    const ping = setInterval(() => this.hub.ping(id), 30_000);
    res.on('close', () => clearInterval(ping));
  }
}
