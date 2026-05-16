// API 응답 envelope. spec docs/30-tech/03-api-contracts.md §0.
// 모든 성공: { data }, 모든 에러: { error: { code, message, details? } }.

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'CSRF_INVALID'
  // 인증
  | 'NO_SESSION'
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PASSWORD'
  | 'EMAIL_TAKEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'OAUTH_PROVIDER_DISABLED'
  | 'OAUTH_PROVIDER_ERROR'
  | 'OAUTH_STATE_INVALID'
  | 'PASSWORD_REQUIRED'
  // 도메인
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'PANEL_NOT_FOUND'
  | 'PAGE_NOT_FOUND'
  | 'API_KEY_NOT_FOUND'
  | 'API_KEY_VERIFY_FAILED'
  | 'CONSISTENCY_NOT_FOUND'
  // 렌더
  | 'RENDER_QUOTA_EXCEEDED'
  | 'RENDER_INVALID_INPUT'
  | 'RENDER_SAFETY_BLOCK'
  | 'RENDER_AUTH_FAILED'
  | 'RENDER_TIMEOUT'
  // 업로드
  | 'UPLOAD_TYPE_NOT_ALLOWED'
  | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_DIMENSIONS_INVALID';

export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}
export interface ApiFailure {
  error: ApiErrorPayload;
}
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function isApiFailure<T>(env: ApiEnvelope<T>): env is ApiFailure {
  return (env as ApiFailure).error !== undefined;
}
