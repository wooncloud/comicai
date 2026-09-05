// 사용자에게 보여줄 에러 문구를 한 곳에서 정한다.
//
// 호출부마다 문장을 박으면 두 가지가 반복해서 새어나갔다:
//   1) `저장 실패: ${err.code}` — VALIDATION_ERROR 같은 영문 enum 이 그대로 노출
//   2) `(err as Error).message` — NestJS 기본 영문 메시지나 ThrottlerException 문구가 노출
// 둘 다 스윕으로 잡으려니 매번 몇 곳씩 놓쳤다. 여기로 모으면 호출부는 문맥만 넘긴다.
import type { ErrorCode } from '@comicai/types';
import { ApiError } from './api';

type Code = ErrorCode | 'HTTP_ERROR';

const RETRY = '잠시 후 다시 시도해 주세요.';

/**
 * 코드별 문구. `null` 은 "코드만으로는 안내할 내용이 없음" 이라는 뜻이고,
 * 이 경우 호출부가 넘긴 동작 문맥(`action`)으로 문장을 만든다.
 *
 * `Record<Code, …>` 라서 packages/types 의 ErrorCode 에 값이 추가되면
 * 여기서 컴파일 에러가 난다 — 문구 누락을 타입으로 막는다.
 */
const BY_CODE: Record<Code, string | null> = {
  // ── 공통 ────────────────────────────────────────
  VALIDATION_ERROR: '입력한 내용을 다시 확인해 주세요.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: null,
  CONFLICT: null, // 상황마다 뜻이 달라 문맥이 필요하다.
  BAD_REQUEST: null,
  RATE_LIMITED: `요청이 너무 잦습니다. ${RETRY}`,
  INTERNAL_ERROR: null, // 서버 문제라 사용자가 할 수 있는 게 없다.
  CSRF_INVALID: '보안 검증에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',

  // ── 인증 ────────────────────────────────────────
  NO_SESSION: '로그인이 필요합니다.',
  SESSION_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  SESSION_NOT_FOUND: '이미 로그아웃된 기기입니다.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  INVALID_PASSWORD: '현재 비밀번호가 올바르지 않습니다.',
  EMAIL_TAKEN: '이미 사용 중인 이메일입니다.',
  EMAIL_NOT_VERIFIED: '이메일 인증이 필요합니다. 받은 편지함을 확인해 주세요.',
  TOKEN_INVALID: '링크가 유효하지 않습니다. 다시 요청해 주세요.',
  TOKEN_EXPIRED: '링크가 만료되었습니다. 다시 요청해 주세요.',
  OAUTH_PROVIDER_DISABLED: '지금은 이 방법으로는 로그인할 수 없습니다. 이메일로 로그인해 주세요.',
  OAUTH_PROVIDER_ERROR: '로그인 정보를 받지 못했습니다. 다시 시도해 주세요.',
  OAUTH_STATE_INVALID: '로그인 시간이 만료되었습니다. 다시 시도해 주세요.',
  OAUTH_EMAIL_UNVERIFIED:
    '이 계정의 이메일이 아직 인증되지 않아 연결할 수 없습니다. 제공자에서 이메일을 인증한 뒤 다시 시도해 주세요.',
  // me.controller.ts:148 — 비밀번호가 없는(소셜 전용) 계정이 비밀번호 변경을 시도한 경우.
  PASSWORD_REQUIRED: '구글·깃허브 로그인으로 가입한 계정입니다. 비밀번호 설정은 준비 중입니다.',

  // ── 도메인 ──────────────────────────────────────
  RESOURCE_NOT_FOUND: null,
  RESOURCE_FORBIDDEN: '권한이 없습니다.',
  PROJECT_NOT_FOUND: '프로젝트를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  PANEL_NOT_FOUND: '컷을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  PAGE_NOT_FOUND: '페이지를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  API_KEY_NOT_FOUND: '지금은 그림을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.',
  API_KEY_VERIFY_FAILED: '키 검증에 실패했습니다. 키가 올바른지 확인해 주세요.',
  CONSISTENCY_NOT_FOUND: '항목을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  SPEECH_BUBBLE_NOT_FOUND: '말풍선을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  PAGE_TEXT_NOT_FOUND: '텍스트를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  PAGE_LINE_NOT_FOUND: '직선을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
  // 그림체 엔티티는 텍스트→이미지 생성 의미가 달라 서버가 거부한다.
  CONSISTENCY_GENERATE_UNSUPPORTED: '그림체는 AI 생성 대상이 아닙니다. 이미지를 직접 올려 주세요.',
  // 실제 사유는 details.category 에 있고 renderErrorMessage 가 그걸 먼저 쓴다.
  CONSISTENCY_GENERATE_FAILED: null,
  CONSISTENCY_ATTACH_INVALID_KEY: '이 항목에 등록할 수 없는 이미지입니다. 다시 생성해 주세요.',
  // 화면이 목록을 통째로 보내므로, 어긋났다면 다른 탭에서 이미 바뀐 것이다.
  INVALID_REORDER: '순서가 이미 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.',
  PAGE_REORDER_MISMATCH: '순서가 이미 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.',

  // ── 이미지 생성 ─────────────────────────────────
  RENDER_QUOTA_EXCEEDED: '오늘 만들 수 있는 그림 수를 다 썼습니다. 내일 다시 시도해 주세요.',
  RENDER_INVALID_INPUT: '본문, 콘티, 참조 이미지 중 하나는 있어야 생성할 수 있습니다.',
  // 큐에 넣지 못해 그 자리에서 마감된 잡. 재시도하면 되는 상황이다.
  RENDER_ENQUEUE_FAILED: `지금은 생성 요청을 받지 못했습니다. ${RETRY}`,
  RENDER_SAFETY_BLOCK: 'AI가 안전 정책상 생성을 거부했습니다. 내용을 바꿔 다시 시도해 주세요.',
  RENDER_AUTH_FAILED: '지금은 그림을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.',
  RENDER_TIMEOUT: `생성이 시간을 초과했습니다. ${RETRY}`,
  INSUFFICIENT_TOKENS: '토큰이 부족합니다. 충전 후 다시 시도해 주세요.',

  // ── 업로드 ──────────────────────────────────────
  UPLOAD_TYPE_NOT_ALLOWED: '지원하지 않는 파일 형식입니다. PNG·JPG·WebP 를 올려 주세요.',
  UPLOAD_TOO_LARGE: '파일이 너무 큽니다. 10MB 이하로 올려 주세요.',
  UPLOAD_DIMENSIONS_INVALID: '이미지 크기가 허용 범위를 벗어났습니다.',
  UPLOAD_FILE_MISSING: '파일을 선택해 주세요.',

  // ── 그 외 ───────────────────────────────────────
  HTTP_ERROR: null, // 네트워크 단절 등 — 문맥이 더 유용하다.
};

/**
 * 에러를 사용자용 문장으로 바꾼다.
 *
 * @param action 실패한 동작. "…하지 못했습니다" 앞에 붙으므로 어간으로 넘긴다
 *               (예: `'프로필을 저장'` → "프로필을 저장하지 못했습니다. …").
 *               코드에 고유 문구가 있으면 그쪽이 우선한다.
 */
export function errorMessage(err: unknown, action?: string): string {
  if (err instanceof ApiError) {
    const known = BY_CODE[err.code];
    if (known) return known;
  }
  return action ? `${action}하지 못했습니다. ${RETRY}` : `요청을 처리하지 못했습니다. ${RETRY}`;
}

/** 워커가 RenderError.category 로 분류해 내려주는 실패 사유. ErrorCode 와는 별개 축이다. */
const BY_RENDER_CATEGORY: Record<string, string> = {
  timeout: 'AI 응답이 너무 오래 걸려 중단되었습니다 (120초 초과)',
  // 플랫폼 키로 도는 구성에서는 사용자가 할 수 있는 일이 없다. 예전 문구는
  // 기능 플래그로 닫아 둔 화면으로 안내해서, 따라갈 수 없는 지시였다.
  auth: '지금은 그림을 만들 수 없습니다. 잠시 후 다시 시도해 주세요',
  quota: '오늘 만들 수 있는 그림 수를 다 썼습니다',
  safety: 'AI가 안전 정책상 생성을 거부했습니다. 설명을 바꿔 다시 시도해 주세요',
  invalid: '요청이 거부되었습니다. 설명이나 API 키를 확인해 주세요',
  transient: '일시적인 오류입니다. 잠시 후 다시 시도해 주세요',
};

/** 이미지 생성 실패. category 가 실려 오면 그 사유를, 아니면 코드/문맥 기반 문구를 쓴다. */
export function renderErrorMessage(err: unknown, action: string): string {
  if (err instanceof ApiError) {
    const category = (err.details as { category?: string } | undefined)?.category;
    const hint = category ? BY_RENDER_CATEGORY[category] : undefined;
    if (hint) return `${action} 실패 — ${hint}`;
  }
  return errorMessage(err, action);
}

/** OAuth 콜백이 쿼리스트링으로 돌려주는 사유. ApiError 가 아니라 별도 네임스페이스다. */
const BY_OAUTH_REASON: Record<string, string> = {
  oauth_provider_disabled: '지금은 이 방법으로는 로그인할 수 없습니다. 이메일로 로그인해 주세요.',
  oauth_state_invalid: '로그인 시간이 만료되었습니다. 다시 시도해 주세요.',
  oauth_missing_params: '로그인 정보를 받지 못했습니다. 다시 시도해 주세요.',
  // 제공자가 이메일 소유를 증명해 주지 않았는데 같은 이메일의 계정이 이미 있는 경우.
  // 여기서 통과시키면 남의 계정을 비밀번호 없이 가져갈 수 있다.
  oauth_email_unverified:
    '해당 서비스에서 이메일이 인증되지 않았습니다. 그쪽에서 이메일을 인증한 뒤 다시 시도하거나, 이메일로 로그인해 주세요.',
};

export function oauthErrorMessage(reason: string): string {
  return BY_OAUTH_REASON[reason] ?? '로그인에 실패했습니다. 다시 시도해 주세요.';
}
