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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PanelCreateSchema, PanelPatchSchema, type PanelShapeInput } from '@comicai/types';
import { PanelsService } from './panels.service';
import { AuthedRequest } from '../auth/session.guard';
import { MAX_UPLOAD_BYTES } from '../storage/image-validator';
import { requireUploadedFile } from '../common/upload';

class CreateDto {
  static zodSchema = PanelCreateSchema;
  shape!: PanelShapeInput;
}
class PatchDto {
  static zodSchema = PanelPatchSchema;
  shape?: PanelShapeInput;
  text?: unknown;
  styleId?: string | null;
}

@Controller()
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

  @Post('panels/:id/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.appendUpload(req.user.id, id, requireUploadedFile(file).buffer);
  }

  /**
   * 콘티(구도 스케치) 붙이기.
   *
   * @deprecated 2026-09-25 화면에서 내렸다(`apps/web/lib/features.ts` 의 `FEATURES.conti`).
   * 엔드포인트는 남긴다 — 이미 콘티가 붙은 컷이 있고, 되살릴 때 다시 만들 이유가 없다.
   * 새 기능을 여기에 얹지 말 것.
   */
  @Post('panels/:id/conti')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  setConti(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.setConti(req.user.id, id, requireUploadedFile(file).buffer);
  }

  /** @deprecated `setConti` 와 같은 이유로 화면에서 내렸다. */
  @Delete('panels/:id/conti')
  clearConti(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.clearConti(req.user.id, id);
  }
}
