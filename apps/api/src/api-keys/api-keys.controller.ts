import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyCreateSchema } from '@comicai/types';
import { ApiKeysService } from './api-keys.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';

class CreateApiKeyDto {
  static zodSchema = ApiKeyCreateSchema;
  provider!: 'gemini' | 'openai';
  label!: string;
  key!: string;
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
    return this.svc.create(req.user.id, body.provider, body.label, body.key);
  }

  @Post(':id/verify')
  verify(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.verify(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.svc.remove(req.user.id, id);
  }
}
