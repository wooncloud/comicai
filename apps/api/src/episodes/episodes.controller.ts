import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { EpisodeCreateSchema, EpisodePatchSchema, EpisodeReorderSchema } from '@comicai/types';
import { EpisodesService } from './episodes.service';
import { AuthedRequest } from '../auth/session.guard';
import { ZodBody } from '../common/zod-body';

class CreateDto extends ZodBody(EpisodeCreateSchema) {}
class PatchDto extends ZodBody(EpisodePatchSchema) {}
class ReorderDto extends ZodBody(EpisodeReorderSchema) {}

@Controller()
export class EpisodesController {
  constructor(private readonly svc: EpisodesService) {}

  @Get('projects/:pid/episodes')
  list(@Req() req: AuthedRequest, @Param('pid') pid: string) {
    return this.svc.list(req.user.id, pid);
  }

  @Post('projects/:pid/episodes')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pid') pid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pid, body.title);
  }

  @Post('projects/:pid/episodes/reorder')
  reorder(@Req() req: AuthedRequest, @Param('pid') pid: string, @Body() body: ReorderDto) {
    return this.svc.reorder(req.user.id, pid, body.episodeIds);
  }

  @Patch('episodes/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('episodes/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
