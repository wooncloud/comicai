import type { ErrorCode } from '@comicai/types';

/**
 * 예외 페이로드를 그대로 돌려주되, `code` 를 **컴파일 시점에** `ErrorCode` 로 묶는다.
 *
 * `throw new NotFoundException({ code: 'FOO' })` 는 인자가 그냥 객체라 아무 문자열이나
 * 통과한다. 그래서 9종의 코드가 `ErrorCode` 유니온 밖에 있었고, 웹의 문구 표
 * (`Record<ErrorCode, …>` — "빠지면 컴파일 에러" 를 선언한다)에도 당연히 없어서
 * 사용자는 그 코드들에 대해 전부 "요청을 처리하지 못했습니다" 만 봤다.
 * **유니온 밖이면 그 방어가 애초에 발동하지 않는다.**
 *
 * 여기를 거치면 새 코드는 API 쪽 컴파일 에러가 되고, 유니온에 넣는 순간 이번엔 웹의
 * 문구 표가 컴파일 에러를 낸다. 두 방어가 이어진다.
 *
 * 예외 클래스는 그대로 쓴다 — 상태 코드를 고르는 일은 호출부의 판단이고, 그걸 이 함수가
 * 대신 정하면 옮기는 과정에서 상태가 바뀔 수 있다.
 *
 * ```ts
 * throw new NotFoundException(apiError({ code: 'PAGE_NOT_FOUND' }));
 * throw new BadRequestException(apiError({ code: 'CONFLICT', message: '이미 완료된 작업입니다.' }));
 * ```
 */
export function apiError(payload: ApiErrorInit): ApiErrorInit {
  return payload;
}

interface ApiErrorInit {
  code: ErrorCode;
  message?: string;
  /** 필터가 `details` 로 옮겨 담는 추가 필드(예: 렌더 실패의 `category`). */
  [extra: string]: unknown;
}
