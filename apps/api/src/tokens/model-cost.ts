import { MODEL_PROVIDER, MODEL_TOKEN_COST, type ModelId, type ModelProvider } from '@comicai/types';

/**
 * 이 호출이 토큰을 얼마나 쓰는가. **"누가 내는가" 규칙은 이 함수 하나다.**
 *
 * 규칙 자체는 짧지만(자기 키가 있으면 무료, mock 은 무료, 나머지는 단가) 이걸 각자
 * 적으면 곧 갈린다. 실제로 갈렸다 — 서버 게이트는 자기 키를 알아봤는데 화면에 찍히는
 * 숫자는 몰라서, **BYOK 사용자가 잔액 0 이면 "0장 · 토큰이 모자랍니다" 를 봤다.**
 * 그 렌더는 토큰을 한 개도 쓰지 않는데도.
 *
 * 키를 실제로 조회하는 일은 호출부가 한다 — 자격 증명을 내주는 쪽은 한 모델만 보면 되고,
 * 잔액 화면은 전 모델을 한 번에 봐야 해서 질의 모양이 다르다. 갈라도 되는 것은 그쪽이다.
 */
export function costFor(model: ModelId, hasOwnKey: boolean): number {
  if (model === 'mock' || hasOwnKey) return 0;
  return MODEL_TOKEN_COST[model];
}

/** 이 사용자가 자기 키를 가진 제공자 집합. */
export function providersWithOwnKey(rows: { provider: string }[]): Set<ModelProvider> {
  return new Set(rows.map((r) => r.provider as ModelProvider));
}

export function hasOwnKeyFor(model: ModelId, owned: Set<ModelProvider>): boolean {
  return model !== 'mock' && owned.has(MODEL_PROVIDER[model]);
}
