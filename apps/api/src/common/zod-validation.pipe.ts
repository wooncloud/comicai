import {
  ArgumentMetadata,
  Injectable,
  InternalServerErrorException,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

/** 전역 파이프라 @Param('id') 같은 원시 타입도 지나간다. 이들은 검증 대상이 아니다. */
const PASS_THROUGH = new Set<unknown>([String, Boolean, Number, Array, Object, Date, Buffer]);

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const metatype = metadata.metatype as
      | ((new (...args: never[]) => unknown) & { zodSchema?: ZodSchema; name?: string })
      | undefined;
    if (!metatype || PASS_THROUGH.has(metatype)) return value;

    const schema = metatype.zodSchema;
    if (!schema) {
      // `class XxxDto { static zodSchema = ... }` 는 이 앱의 body 검증 규약이다.
      // 예전에는 스키마가 없으면 조용히 통과시켰는데, 그러면 규약을 잊은 DTO 가
      // 아무 입력이나 받아들이고 아무도 모른다. 규약 위반은 프로그래밍 오류이므로
      // 첫 요청에서 즉시 터뜨린다(테스트·개발에서 바로 드러난다).
      if (metatype.name?.endsWith('Dto')) {
        throw new InternalServerErrorException({
          code: 'INTERNAL_ERROR',
          message: `${metatype.name}에 static zodSchema 가 없습니다.`,
        });
      }
      return value;
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw parsed.error;
    }
    return parsed.data;
  }
}
