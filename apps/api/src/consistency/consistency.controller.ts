import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ConsistencyService } from './consistency.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

const EntityTypeSchema = z.enum(['style', 'character', 'background', 'worldview']);
const CreateSchema = z.object({
  type: EntityTypeSchema,
  name: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1)).max(20).default([]),
  description: z.string().max(4000).default(''),
});
const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  aliases: z.array(z.string().min(1)).max(20).optional(),
  description: z.string().max(4000).optional(),
});

class CreateDto {
  static zodSchema = CreateSchema;
  type!: 'style' | 'character' | 'background' | 'worldview';
  name!: string;
  aliases!: string[];
  description!: string;
}
class PatchDto {
  static zodSchema = PatchSchema;
  name?: string;
  aliases?: string[];
  description?: string;
}

@Controller()
@UseGuards(SessionGuard)
export class ConsistencyController {
  constructor(private readonly svc: ConsistencyService) {}

  @Get('projects/:pid/consistency')
  list(
    @Req() req: AuthedRequest,
    @Param('pid') pid: string,
    @Query('type') type?: string,
  ) {
    const parsedType = type ? EntityTypeSchema.parse(type) : undefined;
    return this.svc.list(req.user.id, pid, parsedType);
  }

  @Post('projects/:pid/consistency')
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Param('pid') pid: string, @Body() body: CreateDto) {
    return this.svc.create(req.user.id, pid, body);
  }

  @Patch('consistency/:id')
  patch(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PatchDto) {
    return this.svc.patch(req.user.id, id, body);
  }

  @Delete('consistency/:id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
