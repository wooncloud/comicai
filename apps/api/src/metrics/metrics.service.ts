import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus 메트릭. spec 07-error-reliability + 10-non-functional.
 * - http_requests_total{method,route,status}
 * - http_request_duration_seconds (히스토그램)
 * - render_attempts_total{model,outcome}
 * - render_duration_seconds{model}
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests by method/route/status',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
    registers: [this.registry],
  });

  readonly renderAttemptsTotal = new Counter({
    name: 'render_attempts_total',
    help: 'Render attempts by model/outcome',
    labelNames: ['model', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly renderDuration = new Histogram({
    name: 'render_duration_seconds',
    help: 'Render duration by model',
    labelNames: ['model'] as const,
    buckets: [1, 3, 5, 10, 30, 60, 120],
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry, prefix: 'comicai_' });
  }
}
