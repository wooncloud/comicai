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
import { AuthedRequest } from '../auth/session.guard';
import { ApiKeysFeatureGuard } from '../common/feature-flag.guard';

class CreateApiKeyDto {
  static zodSchema = ApiKeyCreateSchema;
  provider!: 'gemini' | 'openai';
  label!: string;
  key!: string;
}

@Controller('api-keys')
/*
 * 세션 검사는 전역 가드가 먼저 한다. 그래서 순서가 "인증 → 플래그" 다.
 *
 * 예전에는 플래그를 먼저 봤는데, 그러면 **비로그인 요청이 플래그 상태를 알아낼 수 있었다**
 * — 꺼져 있으면 404, 켜져 있으면 401 이라 응답이 갈렸다. 지금은 비로그인은 무조건 401 이고
 * 404 는 로그인한 사용자만 본다. 숨기려던 것(아직 공개하지 않은 기능의 존재)이 오히려
 * 더 잘 숨는다.
 */
@UseGuards(ApiKeysFeatureGuard)
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
