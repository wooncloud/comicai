import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PanelsService } from './panels.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

const PointSchema = z.object({ x: z.number(), y: z.number() });
const ShapeSchema = z.object({
  type: z.enum(['rect', 'polygon']),
  points: z.array(PointSchema).min(3).max(64),
  strokeColor: z.string().max(32).default('#000000'),
  strokeWidth: z.number().nonnegative().default(2),
});
const CreateSchema = z.object({ shape: ShapeSchema });
const PatchSchema = z.object({
  shape: ShapeSchema.optional(),
  text: z.any().optional(),
});

class CreateDto { static zodSchema = CreateSchema; shape!: z.infer<typeof ShapeSchema> }
class PatchDto { static zodSchema = PatchSchema; shape?: z.infer<typeof ShapeSchema>; text?: unknown }

@Controller()
@UseGuards(SessionGuard)
export class PanelsController {
  constructor(private readonly svc: PanelsService) {}

  @Get('pages/:pageid/panels')
  list(@Req() req: AuthedRequest, @Param('pageid') pageid: string) {
    return this.svc.list(req.user.id, pageid);
  }

  @Post('pages/:pageid/panels')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pageid') pageid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pageid, body.shape);
  }

  @Patch('panels/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('panels/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }

  @Get('panels/:id/history')
  history(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.history(req.user.id, id);
  }
}
