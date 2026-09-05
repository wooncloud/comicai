// 백엔드 API 호출 래퍼. credentials: 'include' + envelope unwrap.
import { API_PREFIX, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, type ErrorCode } from '@comicai/types';

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_BASE = API_ORIGIN + API_PREFIX;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HAS_FORM_DATA = typeof FormData !== 'undefined';

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

/** 로그인 화면 자신과 그 주변에서는 되돌려 보내지 않는다 — 무한 루프가 된다. */
const NO_REDIRECT_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname;
  if (here === '/' || NO_REDIRECT_PATHS.some((p) => here.startsWith(p))) return;
  // location.href 를 쓴다. 라우터 인스턴스가 없는 자리(훅 밖)에서도 불리고,
  // 세션이 끊긴 뒤에는 클라이언트 캐시를 통째로 버리는 편이 안전하다.
  window.location.href = '/login';
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const isFormData = HAS_FORM_DATA && init.body instanceof FormData;
  const headers: Record<string, string> = {
    // FormData는 브라우저가 boundary 포함 multipart/form-data를 자동 설정해야 함.
    ...(isFormData ? {} : { 'content-type': 'application/json' }),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
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
    /*
     * 세션이 없거나 만료됐으면 로그인으로 보낸다. **여기가 그 판단의 자리다.**
     *
     * 예전에는 이 처리가 Topbar 안에 있었다(그리고 API 키 화면에 손복사본이 하나
     * 더 있었다). 그런데 에디터는 AppShell 을 쓰지 않아서, 세션이 만료된 채 에디터를
     * 열면 다섯 요청이 전부 401 로 죽고 리다이렉트도 오류 화면도 없이 빈 캔버스만
     * 남았다. 게다가 providers.tsx 의 오류 경계는 "401 은 Topbar 가 처리한다" 를
     * 전제로 면제 조항을 두고 있어서, 그 전제가 성립하지 않는 화면에서는 근거 없는
     * 면제가 됐다.
     *
     * `INVALID_CREDENTIALS` 는 제외한다 — 로그인 실패도 401 이지만, 그건 이미
     * 로그인 화면에 있는 사람에게 문구로 알려 줄 일이지 이동시킬 일이 아니다.
     */
    if (res.status === 401 && (code === 'NO_SESSION' || code === 'SESSION_EXPIRED')) {
      redirectToLogin();
    }
    throw new ApiError(res.status, code, message, details);
  }
  if (res.status === 204) return undefined as T;
  // 본문이 리터럴 `null` 이면 `res.json()` 은 null 을 준다. 캐스트로 그걸 지우면
  // 아래 `body &&` 가 불필요해 보이고, 지우면 `'data' in null` 에서 TypeError 다.
  const body = (await res.json()) as { data?: T } | null;
  return (body && typeof body === 'object' && 'data' in body ? body.data : (body as T)) as T;
}
