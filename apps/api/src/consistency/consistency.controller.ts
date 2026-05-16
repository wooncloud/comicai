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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ConsistencyService } from './consistency.service';
import { SessionGuard, AuthedRequest } from '../auth/session.guard';
import { MAX_UPLOAD_BYTES } from '../storage/image-validator';

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
    if (!file) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'multipart field "file"이 필요합니다.',
      });
    }
    return this.svc.appendImage(req.user.id, id, file.buffer);
  }
}
