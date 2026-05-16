import { BadRequestException } from '@nestjs/common';

export function requireUploadedFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'multipart field "file"이 필요합니다.',
    });
  }
  return file;
}
