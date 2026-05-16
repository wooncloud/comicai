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
import { PageCreateSchema, PagePatchSchema } from '@comicai/types';
import { PagesService } from './pages.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

class CreateDto {
  static zodSchema = PageCreateSchema;
  size!: { w: number; h: number };
}
class PatchDto {
  static zodSchema = PagePatchSchema;
  order?: number;
  size?: { w: number; h: number };
}

@Controller()
@UseGuards(SessionGuard)
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
