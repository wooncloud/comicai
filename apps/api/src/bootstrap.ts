import type { INestApplication, NestInterceptor } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ZodValidationPipe } from './common/zod-validation.pipe';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Nest 앱에 글로벌 파이프라인을 적용한다. main.ts(production)와 통합 테스트(setup.ts)가
 * 동일한 미들웨어 체인을 사용하도록 한곳에서 정의.
 */
export function applyAppPipeline(
  app: INestApplication,
  options: { extraInterceptors?: NestInterceptor[] } = {},
): void {
  app.setGlobalPrefix('v1', { exclude: ['healthz'] });
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalInterceptors(
    ...(options.extraInterceptors ?? []),
    new ResponseEnvelopeInterceptor(),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
