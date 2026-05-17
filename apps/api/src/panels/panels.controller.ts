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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PanelCreateSchema, PanelPatchSchema, type PanelShapeInput } from '@comicai/types';
import { PanelsService } from './panels.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
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

  @Post('panels/:id/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.appendUpload(req.user.id, id, requireUploadedFile(file).buffer);
  }
}
