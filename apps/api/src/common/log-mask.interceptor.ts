import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

// 응답이 직렬화되기 전 API 키 패턴을 마스킹. 보수적 정규식 모음.
const PATTERNS: RegExp[] = [
  /\b(sk-[A-Za-z0-9]{20,})\b/g, // OpenAI
  /\b(AIza[0-9A-Za-z_-]{30,})\b/g, // Google API keys
];

function mask(value: unknown): unknown {
  if (typeof value === 'string') {
    return PATTERNS.reduce((acc, re) => acc.replace(re, '***'), value);
  }
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/api[_-]?key|secret|token|ciphertext/i.test(k)) {
        out[k] = '***';
      } else {
        out[k] = mask(v);
      }
    }
    return out;
  }
  return value;
}

@Injectable()
export class ApiKeyLogMaskInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((value) => {
        // 로그 마스킹만 담당. 응답 본문은 그대로 흘려보낸다.
        if (process.env.LOG_RESPONSES === '1') {
          // eslint-disable-next-line no-console
          console.log('[api]', JSON.stringify(mask(value)));
        }
      }),
    );
  }
}

export { mask as maskApiKeyLikeStrings };
