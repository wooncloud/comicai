import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { PageCreateSchema, PagePatchSchema, PageReorderSchema } from '@comicai/types';
import { PagesService } from './pages.service';
import { AuthedRequest } from '../auth/session.guard';

class CreateDto {
  static zodSchema = PageCreateSchema;
  size!: { w: number; h: number };
}
class PatchDto {
  static zodSchema = PagePatchSchema;
  size?: { w: number; h: number };
  name?: string | null;
  backgroundColor?: string | null;
}
class ReorderDto {
  static zodSchema = PageReorderSchema;
  pageIds!: string[];
}

@Controller()
export class PagesController {
  constructor(private readonly svc: PagesService) {}

  @Get('projects/:pid/pages')
  list(@Req() req: AuthedRequest, @Param('pid') pid: string) {
    return this.svc.list(req.user.id, pid);
  }

  @Post('projects/:pid/pages')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pid') pid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pid, body.size);
  }

  @Get('episodes/:id/pages')
  listByEpisode(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.listByEpisode(req.user.id, id);
  }

  @Post('episodes/:id/pages')
  @HttpCode(201)
  createInEpisode(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: CreateDto) {
    return this.svc.createInEpisode(req.user.id, id, body.size);
  }

  /** 순서는 **화 안에서만** 의미가 있다 — 프로젝트 전체를 다시 매기지 않는다. */
  @Post('episodes/:id/pages/reorder')
  reorder(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: ReorderDto) {
    return this.svc.reorder(req.user.id, id, body.pageIds);
  }

  @Get('pages/:id')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.get(req.user.id, id);
  }

  @Patch('pages/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('pages/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
