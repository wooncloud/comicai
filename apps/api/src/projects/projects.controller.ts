import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ProjectsService } from './projects.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

const CreateSchema = z.object({ name: z.string().min(1).max(100) });
const PatchSchema = z.object({ name: z.string().min(1).max(100).optional() });

class CreateDto { static zodSchema = CreateSchema; name!: string }
class PatchDto { static zodSchema = PatchSchema; name?: string }

@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list(@Req() req: AuthedRequest) { return this.svc.list(req.user.id); }

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, body.name);
  }

  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.detail(req.user.id, id);
  }

  @Patch(':id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
