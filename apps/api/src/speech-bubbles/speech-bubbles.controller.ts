import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SpeechBubbleCreateSchema,
  SpeechBubblePatchSchema,
  SpeechBubbleReorderSchema,
  type SpeechBubbleShape,
  type SpeechBubbleStyle,
  type SpeechBubbleVariant,
  type TipTapDoc,
} from '@comicai/types';
import { SpeechBubblesService } from './speech-bubbles.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

class CreateDto {
  static zodSchema = SpeechBubbleCreateSchema;
  variant!: SpeechBubbleVariant;
  shape!: SpeechBubbleShape;
  text?: TipTapDoc;
  style?: Partial<SpeechBubbleStyle>;
}

class PatchDto {
  static zodSchema = SpeechBubblePatchSchema;
  variant?: SpeechBubbleVariant;
  shape?: SpeechBubbleShape;
  text?: TipTapDoc;
  style?: Partial<SpeechBubbleStyle>;
}

class ReorderDto {
  static zodSchema = SpeechBubbleReorderSchema;
  ids!: string[];
}

@Controller()
@UseGuards(SessionGuard)
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
