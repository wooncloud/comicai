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
import { InsufficientTokensError } from '../tokens/tokens.service';

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

    /*
     * 토큰 부족은 정책 거부이지 서버 오류가 아니다.
     *
     * 예전에는 렌더 사전 검사 한 곳만 이걸 손으로 `INSUFFICIENT_TOKENS` 봉투로 옮겼고,
     * 같은 예외를 던지는 다른 경로들은 그 대접을 못 받았다 — 참조 이미지 생성은
     * 숫자 없는 일반 문구로 뭉개졌고, **운영자가 잔액보다 많이 회수하면 500
     * INTERNAL_ERROR 로 나가면서 로그에 'unhandled exception' 으로 쌓였다.**
     *
     * 예외 자신이 `required`/`balance` 를 들고 있으니 여기서 한 번만 옮긴다. 웹의
     * `insufficientTokensMessage` 가 그 두 수로 정확한 문구를 만든다.
     */
    if (exception instanceof InsufficientTokensError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: 'INSUFFICIENT_TOKENS',
            message: exception.message,
            details: { required: exception.required, balance: exception.balance },
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
