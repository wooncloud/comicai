import {
  BadRequestException,
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ConsistencyCreateSchema,
  ConsistencyPatchSchema,
  EntityTypeSchema,
  type EntityType,
} from '@comicai/types';
import { ConsistencyService } from './consistency.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
import { MAX_UPLOAD_BYTES } from '../storage/image-validator';

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

  /**
   * 참조 이미지 N개 업로드. multipart field 'files' (다중) 권장.
   * 옛 클라이언트의 'file' 단일 필드도 multer가 같은 흐름에 합쳐 처리해줌.
   */
  @Post('consistency/:id/images')
  @UseInterceptors(FilesInterceptor('files', 12, { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadImages(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    if (!files.length) {
      throw new BadRequestException({ code: 'UPLOAD_FILE_MISSING', message: '파일이 없습니다.' });
    }
    return this.svc.appendImages(
      req.user.id,
      id,
      files.map((f) => f.buffer),
    );
  }
}
