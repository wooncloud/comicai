// 백엔드 API 호출 래퍼. credentials: 'include' + envelope unwrap.
import { API_PREFIX, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, type ErrorCode } from '@comicai/types';

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_BASE = API_ORIGIN + API_PREFIX;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | 'HTTP_ERROR',
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : undefined;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCsrfToken();
    if (csrf) headers[CSRF_HEADER_NAME] = csrf;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    let code: ErrorCode | 'HTTP_ERROR' = 'HTTP_ERROR';
    let message = res.statusText;
    let details: unknown;
    try {
      const body = await res.json();
      const err = body?.error;
      if (err && typeof err === 'object') {
        if (typeof err.code === 'string') code = err.code as ErrorCode | 'HTTP_ERROR';
        if (typeof err.message === 'string') message = err.message;
        details = err.details;
      } else {
        if (typeof body?.code === 'string') code = body.code as ErrorCode | 'HTTP_ERROR';
        if (typeof body?.message === 'string') message = body.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, code, message, details);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as { data?: T };
  return (body && typeof body === 'object' && 'data' in body ? body.data : (body as T)) as T;
}
