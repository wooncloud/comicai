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
  PageLineCreateSchema,
  PageLinePatchSchema,
  PageLineReorderSchema,
  type PageLineStyle,
} from '@comicai/types';
import { PageLinesService } from './page-lines.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

class CreateDto {
  static zodSchema = PageLineCreateSchema;
  x1!: number;
  y1!: number;
  x2!: number;
  y2!: number;
  style?: Partial<PageLineStyle>;
}

class PatchDto {
  static zodSchema = PageLinePatchSchema;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  style?: Partial<PageLineStyle>;
}

class ReorderDto {
  static zodSchema = PageLineReorderSchema;
  ids!: string[];
}

@Controller()
@UseGuards(SessionGuard)
export class PageLinesController {
  constructor(private readonly svc: PageLinesService) {}

  @Get('pages/:pageid/page-lines')
  list(@Req() req: AuthedRequest, @Param('pageid') pageid: string) {
    return this.svc.list(req.user.id, pageid);
  }

  @Post('pages/:pageid/page-lines')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pageid, body);
  }

  @Post('pages/:pageid/page-lines/reorder')
  reorder(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: ReorderDto) {
    return this.svc.reorder(req.user.id, pageid, body.ids);
  }

  @Patch('page-lines/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('page-lines/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
