import type { ModelAdapter } from '@comicai/adapters';
import type { RenderError } from '@comicai/types';

/**
 * 모델 호출 실패를 `RenderError` 로 분류한다.
 *
 * 우리가 던진 예외는 이미 자기 분류를 알고 있다(키 없음 = auth, 상한 초과 = quota).
 * 어댑터의 `classifyError` 는 프로바이더의 HTTP 응답만 볼 줄 알아서, 이걸 그냥 넘기면
 * 전부 'transient' 로 떨어진다 — 그러면 재시도해도 소용없는 실패에 "잠시 후 다시" 라고
 * 안내하게 되고, 재시도 대상이 되어 유료 호출이 그만큼 반복된다.
 *
 * 어댑터를 부르는 자리가 워커 말고도 있어서(참조 이미지 생성) 여기 한 벌만 둔다.
 */
export function classifyModelError(err: unknown, adapter: ModelAdapter): RenderError {
  const own = (err as { category?: RenderError['category'] } | null)?.category;
  if (!own) return adapter.classifyError(err);
  return { category: own, message: err instanceof Error ? err.message : String(err) };
}
