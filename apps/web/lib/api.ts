// 클라이언트에서 백엔드 API 호출용 래퍼.
// 세션 쿠키 전송을 위해 항상 credentials: 'include'.
// 응답은 spec 03-api-contracts §0 envelope: { data } / { error: { code, message, details } }.
import { API_PREFIX, type ErrorCode } from '@comicai/types';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000') + API_PREFIX;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | (string & {}),
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = res.statusText;
    let details: unknown;
    try {
      const body = await res.json();
      const err = body?.error;
      if (err && typeof err === 'object') {
        code = typeof err.code === 'string' ? err.code : code;
        message = typeof err.message === 'string' ? err.message : message;
        details = err.details;
      } else {
        code = body?.code ?? code;
        message = body?.message ?? message;
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
