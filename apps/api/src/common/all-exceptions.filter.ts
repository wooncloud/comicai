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
  /*
   * 선언은 `string | object` 지만 HttpException 은 생성자 인자를 그대로 돌려준다 —
   * `new HttpException(null, 500)` 이면 null 이 나온다. 그냥 두면 아래 `resp &&` 가
   * lint 에 "항상 truthy" 로 보이고, 그 말을 믿고 지우면 **예외 필터 자신이**
   * TypeError 로 죽어서 원래 예외까지 함께 사라진다.
   *
   * 애너테이션이 아니라 캐스트여야 한다. TS 는 대입 시점에 초기화식의 타입으로
   * 좁히므로, `const resp: … | null = f()` 은 좁히기에 아무 영향이 없다.
   */
  const resp = exception.getResponse() as string | object | null;
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
