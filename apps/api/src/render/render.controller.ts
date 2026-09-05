import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { RenderStartSchema, type ModelId, type RenderJobDTO } from '@comicai/types';
import type { RenderSseEvent } from '@comicai/events';
import { RenderService } from './render.service';
import { SseHub } from './sse.hub';
import { AuthedRequest } from '../auth/session.guard';
import { PanelsService } from '../panels/panels.service';

class StartDto {
  static zodSchema = RenderStartSchema;
  model!: ModelId;
  seed?: number;
}

@Controller()
export class RenderController {
  constructor(
    private readonly svc: RenderService,
    private readonly hub: SseHub,
    private readonly panels: PanelsService,
  ) {}

  @Post('panels/:id/render')
  @HttpCode(202)
  start(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: StartDto) {
    return this.svc.startRender(req.user.id, id, body.model, body.seed);
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

  @Post('render-jobs/:id/restore')
  restore(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.panels.restoreRender(req.user.id, id);
  }

  @Get('render-jobs/:id/events')
  @SkipThrottle()
  async events(@Req() req: AuthedRequest, @Param('id') id: string, @Res() res: Response) {
    // 소유권 확인 겸 **현재 상태**를 읽는다. 예전에는 권한만 보고 이 값을 버렸는데,
    // 그래서 api 가 재시작한 뒤 재연결한 브라우저는 이미 끝난 잡을 알 방법이 없었다.
    const job = await this.svc.getJob(req.user.id, id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const lastEventId =
      typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined;
    this.hub.subscribe(id, res, lastEventId, snapshotEvents(job));
    const ping = setInterval(() => this.hub.ping(id), 30_000);
    res.on('close', () => clearInterval(ping));
  }
}

/**
 * 재연결 직후 한 번 흘려보낼 "지금 상태". 워커가 발행하는 것과 같은 모양이라
 * 클라이언트는 평소 경로로 처리한다(별도 분기가 필요 없다).
 *
 * 실패한 잡은 error 를 먼저 보낸다 — 워커의 발행 순서와 같다. status 만 보내면
 * 화면에 "실패" 토스트는 뜨는데 사유 배너가 비어 있다.
 */
function snapshotEvents(job: RenderJobDTO): RenderSseEvent[] {
  const events: RenderSseEvent[] = [];
  if (job.error) events.push({ type: 'error', jobId: job.id, error: job.error });
  events.push({
    type: 'status',
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    ...(job.resultImage ? { resultImage: job.resultImage } : {}),
  });
  return events;
}
