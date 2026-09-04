/**
 * 부분 갱신 스타일 병합. `defaults → 기존값 → 입력` 순으로 덮는다.
 *
 * 말풍선·페이지 텍스트·페이지 직선의 `PatchSchema` 는 `style` 을 `.partial()` 로 받는다.
 * 서비스가 기존 값을 빼먹고 `{...defaults, ...input}` 로 덮어쓰면 **명시하지 않은 필드가
 * 기본값으로 되돌아간다** — 굵기 8인 선의 색만 바꿔도 굵기가 2로 리셋된다.
 *
 * 세 모듈이 복붙이라 같은 결함이 3벌로 복제됐었다. 규칙은 여기 한 곳에만 둔다
 * (`style-merge.spec.ts` 가 고정한다). 예전에는 그 spec 안에 `merge` 가 정의돼 있어서,
 * **테스트는 통과하는데 서비스는 각자 병합하는** 상태였다 — 고정한 규칙과 실제로 도는
 * 코드가 다른 셈이다.
 *
 * `undefined`/`null` 레이어는 건너뛴다. 호출부가 `input.style ?? {}` 를 쓰지 않아도 된다.
 */
export function mergeStyle<T extends object>(
  defaults: T,
  ...layers: (Partial<T> | null | undefined)[]
): T {
  return layers.reduce<T>((acc, layer) => (layer ? { ...acc, ...layer } : acc), { ...defaults });
}
