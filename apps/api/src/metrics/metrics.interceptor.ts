import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (req.url === '/metrics' || req.url === '/healthz') {
      return next.handle();
    }
    const route = (req.route?.path as string | undefined) ?? req.url.split('?')[0] ?? 'unknown';
    const stop = this.metrics.httpRequestDuration.startTimer({ method: req.method, route });
    return next.handle().pipe(
      tap({
        next: () => this.record(req.method, route, res.statusCode, stop),
        error: () => this.record(req.method, route, res.statusCode || 500, stop),
      }),
    );
  }

  private record(
    method: string,
    route: string,
    status: number,
    stop: (labels?: Partial<Record<'status', string>>) => number,
  ) {
    this.metrics.httpRequestsTotal.inc({ method, route, status: String(status) });
    stop({ status: String(status) });
  }
}
