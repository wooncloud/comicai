import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PagesService } from './pages.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

const SizeSchema = z.object({ w: z.number().int().positive(), h: z.number().int().positive() });
const CreateSchema = z.object({
  size: SizeSchema.default({ w: 800, h: 1200 }),
});
const PatchSchema = z.object({
  order: z.number().int().nonnegative().optional(),
  size: SizeSchema.optional(),
});

class CreateDto { static zodSchema = CreateSchema; size!: { w: number; h: number } }
class PatchDto { static zodSchema = PatchSchema; order?: number; size?: { w: number; h: number } }

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
