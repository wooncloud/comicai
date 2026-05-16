// 클라이언트에서 백엔드 API 호출용 래퍼.
// 세션 쿠키 전송을 위해 항상 credentials: 'include'.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
    try {
      const body = await res.json();
      code = body?.code ?? body?.message?.code ?? code;
      message = body?.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
