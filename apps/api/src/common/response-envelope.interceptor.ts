import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';

/**
 * 모든 성공 응답을 `{ data: ... }`로 감싼다.
 * 204(No Content) 및 SSE 응답은 통과.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = ctx.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((value) => {
        // 컨트롤러가 @Res()로 직접 응답을 보낸 경우 (redirect 등) wrap 하지 않는다.
        if (res.headersSent) return value;
        if (res.statusCode === 204) return value;
        const contentType = res.getHeader('content-type');
        if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
          return value;
        }
        return { data: value };
      }),
    );
  }
}
