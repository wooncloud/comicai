import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

const ID_SEGMENT = /^(?:[A-Za-z0-9]{20,}|[a-z]+_[A-Za-z0-9]+)$/;
const SKIP_PATHS = new Set(['/metrics', '/healthz']);

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (SKIP_PATHS.has(req.path)) return next.handle();
    const route = normalizeRoute(req.route?.path, req.path);
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

function normalizeRoute(routePath: string | undefined, fallbackPath: string): string {
  if (routePath) return routePath;
  // 라우트 메타가 없을 때만 path를 정규화. ulid/uuid/prefix_id 등 ID 세그먼트를 :id로 치환.
  return fallbackPath
    .split('/')
    .map((seg) => (ID_SEGMENT.test(seg) ? ':id' : seg))
    .join('/');
}
