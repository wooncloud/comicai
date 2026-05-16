import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 모든 예외를 spec 03-api-contracts §0의 `{ error: { code, message, details } }` 형태로 직렬화.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toEnvelope(exception);
    if (status >= 500) {
      this.logger.error({ err: exception }, 'unhandled exception');
    }
    res.status(status).json(body);
  }

  private toEnvelope(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof ZodError) {
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: '입력 검증 실패',
            details: { issues: exception.issues },
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      return { status, body: this.fromHttpException(status, resp) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류' } },
    };
  }

  private fromHttpException(status: number, resp: unknown): ErrorEnvelope {
    if (typeof resp === 'string') {
      return { error: { code: defaultCode(status), message: resp } };
    }
    if (resp && typeof resp === 'object') {
      const r = resp as Record<string, unknown>;
      const code = typeof r.code === 'string' ? r.code : defaultCode(status);
      const message = typeof r.message === 'string' ? r.message : codeToMessage(code, status);
      const { code: _c, message: _m, statusCode: _s, error: _e, ...rest } = r;
      const details = Object.keys(rest).length > 0 ? rest : undefined;
      return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
    }
    return {
      error: { code: defaultCode(status), message: codeToMessage(defaultCode(status), status) },
    };
  }
}

function defaultCode(status: number): string {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

function codeToMessage(code: string, status: number): string {
  switch (code) {
    case 'NO_SESSION':
    case 'SESSION_EXPIRED':
      return '인증이 필요합니다.';
    case 'INVALID_CREDENTIALS':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'EMAIL_TAKEN':
      return '이미 사용 중인 이메일입니다.';
    case 'VALIDATION_ERROR':
      return '입력 검증 실패';
    default:
      return `HTTP ${status}`;
  }
}
