import { BadRequestException } from '@nestjs/common';

export function requireUploadedFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: '이미지 파일을 선택해 주세요.',
    });
  }
  return file;
}
