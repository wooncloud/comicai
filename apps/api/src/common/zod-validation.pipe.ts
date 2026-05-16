import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const schema = (metadata.metatype as unknown as { zodSchema?: ZodSchema })?.zodSchema;
    if (!schema) return value;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw parsed.error;
    }
    return parsed.data;
  }
}
