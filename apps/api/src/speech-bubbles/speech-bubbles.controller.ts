import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import {
  SpeechBubbleCreateSchema,
  SpeechBubblePatchSchema,
  SpeechBubbleReorderSchema,
} from '@comicai/types';
import { SpeechBubblesService } from './speech-bubbles.service';
import { AuthedRequest } from '../auth/session.guard';
import { ZodBody } from '../common/zod-body';

class CreateDto extends ZodBody(SpeechBubbleCreateSchema) {}

class PatchDto extends ZodBody(SpeechBubblePatchSchema) {}

class ReorderDto extends ZodBody(SpeechBubbleReorderSchema) {}

@Controller()
export class SpeechBubblesController {
  constructor(private readonly svc: SpeechBubblesService) {}

  @Get('pages/:pageid/speech-bubbles')
  list(@Req() req: AuthedRequest, @Param('pageid') pageid: string) {
    return this.svc.list(req.user.id, pageid);
  }

  @Post('pages/:pageid/speech-bubbles')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pageid, body);
  }

  @Post('pages/:pageid/speech-bubbles/reorder')
  reorder(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: ReorderDto) {
    return this.svc.reorder(req.user.id, pageid, body.ids);
  }

  @Patch('speech-bubbles/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('speech-bubbles/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
