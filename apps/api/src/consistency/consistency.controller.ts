import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ConsistencyCreateSchema,
  ConsistencyPatchSchema,
  EntityTypeSchema,
  type EntityType,
} from '@comicai/types';
import { ConsistencyService } from './consistency.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
import { MAX_UPLOAD_BYTES } from '../storage/image-validator';
import { requireUploadedFile } from '../common/upload';

class CreateDto {
  static zodSchema = ConsistencyCreateSchema;
  type!: EntityType;
  name!: string;
  aliases!: string[];
  description!: string;
}
class PatchDto {
  static zodSchema = ConsistencyPatchSchema;
  name?: string;
  aliases?: string[];
  description?: string;
}

@Controller()
@UseGuards(SessionGuard)
export class ConsistencyController {
  constructor(private readonly svc: ConsistencyService) {}

  @Get('projects/:pid/consistency')
  list(@Req() req: AuthedRequest, @Param('pid') pid: string, @Query('type') type?: string) {
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

  @Post('consistency/:id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadImage(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.appendImage(req.user.id, id, requireUploadedFile(file).buffer);
  }
}
