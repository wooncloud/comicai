import type { RenderError } from '@comicai/types';

/**
 * 프로바이더 HTTP 응답 실패.
 *
 * `status` 는 실제 HTTP 상태만이 아니다 — HTTP 는 성공했는데 쓸 이미지가 없는 응답에
 * `200` 을, 요청을 만들지도 못한 경우에 `0` 을 넣는다. 그 둘을 재시도 대상에서 빼는 것이
 * `classifyModelHttpError` 의 마지막 분기다.
 *
 * 예전에는 이 클래스가 어댑터마다 9줄씩 똑같이 있었다. 새 어댑터를 붙이면 3벌째가 된다.
 */
export class ModelHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public raw?: unknown,
  ) {
    super(message);
  }
}

interface ClassifyOptions {
  /** AbortError 일 때 쓸 메시지. 프로바이더 이름이 들어간다. */
  timeoutMessage: string;
  /**
   * 이 실패가 안전성 거부인가. **프로바이더마다 표현이 다른 유일한 지점이다.**
   * Gemini 는 응답 본문(finishReason / blockReason)으로, OpenAI 는 400 본문의
   * `content_policy` 문자열로 알린다.
   */
  isSafety?: (err: ModelHttpError) => boolean;
}

/**
 * 프로바이더 실패를 `RenderError` 로 분류한다.
 *
 * **분류가 곧 재시도 정책이라 틀리면 돈이 샌다** — `retryLimitFor` 는 `transient` 에만
 * 3을 주므로, 통과할 수 없는 요청이 transient 로 새면 세 번 호출되고 세 번 과금된다.
 * 두 어댑터가 순서까지 같은 분기를 각자 갖고 있었고, 차이는 안전성 판정 하나뿐이었다.
 */
export function classifyModelHttpError(err: unknown, opts: ClassifyOptions): RenderError {
  if ((err as { name?: string } | null)?.name === 'AbortError') {
    return { category: 'timeout', message: opts.timeoutMessage };
  }
  if (err instanceof ModelHttpError) {
    const message = err.message;
    if (opts.isSafety?.(err)) return { category: 'safety', message, rawResponse: err.raw };
    if (err.status === 401 || err.status === 403) return { category: 'auth', message };
    if (err.status === 429) return { category: 'quota', message };
    if (err.status >= 500) return { category: 'transient', message };
    if (err.status === 400) return { category: 'invalid', message, rawResponse: err.raw };
    /*
     * 남는 것은 HTTP 는 성공했는데 쓸 이미지가 없는 응답(200)과, 요청을 만들지도 못한
     * 경우(0)다. 'transient' 로 두면 절대 통과 못 할 요청을 세 번 호출·세 번 과금하고
     * "잠시 후 다시" 를 안내한다. 같은 입력이면 결과도 같으니 재시도 대상이 아니다.
     */
    if (err.status < 400) return { category: 'invalid', message, rawResponse: err.raw };
    return { category: 'transient', message };
  }
  if ((err as { code?: string } | null)?.code === 'ECONNRESET') {
    return { category: 'transient', message: 'connection reset' };
  }
  return { category: 'transient', message: (err as Error | null)?.message ?? 'unknown' };
}
