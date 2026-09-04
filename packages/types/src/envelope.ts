// API 응답 envelope. spec docs/30-tech/03-api-contracts.md §0.
// 모든 성공: { data }, 모든 에러: { error: { code, message, details? } }.
//
// **여기 없는 코드는 API 가 던질 수 없다.** 서비스가 `apiError()`(apps/api/src/common/
// api-error.ts)로만 던지므로, 목록에 없는 코드는 컴파일 에러가 된다. 예전에는 문자열을
// 그대로 넣을 수 있어서 9종이 이 유니온 밖에 있었고, 그 코드들은 웹의 문구 표에도 없어
// 사용자가 전부 "요청을 처리하지 못했습니다" 만 봤다 — 표가 `Record<ErrorCode, …>` 라
// "빠지면 컴파일 에러" 를 선언하는데, 애초에 유니온 밖이라 그 방어가 발동하지 않았다.

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
  | 'OAUTH_EMAIL_UNVERIFIED'
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
  | 'CONSISTENCY_GENERATE_UNSUPPORTED'
  | 'CONSISTENCY_GENERATE_FAILED'
  | 'CONSISTENCY_ATTACH_INVALID_KEY'
  | 'SPEECH_BUBBLE_NOT_FOUND'
  | 'PAGE_TEXT_NOT_FOUND'
  | 'PAGE_LINE_NOT_FOUND'
  | 'INVALID_REORDER'
  | 'PAGE_REORDER_MISMATCH'
  // 렌더
  | 'RENDER_QUOTA_EXCEEDED'
  | 'RENDER_INVALID_INPUT'
  | 'RENDER_ENQUEUE_FAILED'
  | 'RENDER_SAFETY_BLOCK'
  | 'RENDER_AUTH_FAILED'
  | 'RENDER_TIMEOUT'
  // 업로드
  | 'UPLOAD_TYPE_NOT_ALLOWED'
  | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_DIMENSIONS_INVALID'
  | 'UPLOAD_FILE_MISSING';

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
