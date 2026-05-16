import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ApiKeysService } from './api-keys.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

const CreateSchema = z.object({
  provider: z.enum(['gemini', 'openai']),
  label: z.string().min(1).max(80),
  secret: z.string().min(8).max(500),
});

class CreateApiKeyDto {
  static zodSchema = CreateSchema;
  provider!: 'gemini' | 'openai';
  label!: string;
  secret!: string;
}

@Controller('api-keys')
@UseGuards(SessionGuard)
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user.id);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthedRequest, @Body() body: CreateApiKeyDto) {
    return this.svc.create(req.user.id, body.provider, body.label, body.secret);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
