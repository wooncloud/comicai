import { BadRequestException } from '@nestjs/common';
import { apiError } from './api-error';

export function requireUploadedFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) {
    throw new BadRequestException(
      apiError({
        code: 'VALIDATION_ERROR',
        message: '이미지 파일을 선택해 주세요.',
      }),
    );
  }
  return file;
}
