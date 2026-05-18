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
  PageTextCreateSchema,
  PageTextPatchSchema,
  PageTextReorderSchema,
  type PageTextStyle,
} from '@comicai/types';
import { PageTextsService } from './page-texts.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

class CreateDto {
  static zodSchema = PageTextCreateSchema;
  x!: number;
  y!: number;
  w!: number;
  h!: number;
  text?: string;
  style?: Partial<PageTextStyle>;
}

class PatchDto {
  static zodSchema = PageTextPatchSchema;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  style?: Partial<PageTextStyle>;
}

class ReorderDto {
  static zodSchema = PageTextReorderSchema;
  ids!: string[];
}

@Controller()
@UseGuards(SessionGuard)
export class PageTextsController {
  constructor(private readonly svc: PageTextsService) {}

  @Get('pages/:pageid/page-texts')
  list(@Req() req: AuthedRequest, @Param('pageid') pageid: string) {
    return this.svc.list(req.user.id, pageid);
  }

  @Post('pages/:pageid/page-texts')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pageid, body);
  }

  @Post('pages/:pageid/page-texts/reorder')
  reorder(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: ReorderDto) {
    return this.svc.reorder(req.user.id, pageid, body.ids);
  }

  @Patch('page-texts/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('page-texts/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
