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

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

// 서비스 레이어는 message 없이 { code }만 throw하는 컨벤션 — 사용자-노출용 한국어 텍스트 매핑.
const CODE_TO_MESSAGE: Record<string, string> = {
  NO_SESSION: '인증이 필요합니다.',
  SESSION_EXPIRED: '인증이 필요합니다.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  EMAIL_TAKEN: '이미 사용 중인 이메일입니다.',
  VALIDATION_ERROR: '입력 검증 실패',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toEnvelope(exception);
    if (status >= 500) {
      this.logger.error({ err: exception }, 'unhandled exception');
    }
    // 컨트롤러가 이미 응답을 끝낸 뒤 (예: res.redirect 후) 발생한 예외를 또 한 번
    // res.json 으로 처리하면 ERR_HTTP_HEADERS_SENT 가 두 번 던져져 프로세스가 죽는다.
    if (res.headersSent) return;
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
      return { status, body: fromHttpException(status, exception) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류' } },
    };
  }
}

function defaultCode(status: number): string {
  return STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
}

function fromHttpException(status: number, exception: HttpException): ErrorEnvelope {
  const resp = exception.getResponse();
  if (typeof resp === 'string') {
    return { error: { code: defaultCode(status), message: resp } };
  }
  if (resp && typeof resp === 'object') {
    const r = resp as Record<string, unknown>;
    const code = typeof r.code === 'string' ? r.code : defaultCode(status);
    const message =
      typeof r.message === 'string' ? r.message : (CODE_TO_MESSAGE[code] ?? exception.message);
    const { code: _c, message: _m, statusCode: _s, error: _e, ...rest } = r;
    const details = Object.keys(rest).length > 0 ? rest : undefined;
    return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  }
  const code = defaultCode(status);
  return { error: { code, message: CODE_TO_MESSAGE[code] ?? exception.message } };
}
