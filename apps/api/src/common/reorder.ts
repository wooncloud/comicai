/**
 * `ids` 가 현재 집합의 **순열**인지. 재정렬 요청은 순열이어야만 의미가 있다.
 *
 * 예전에는 네 곳(pages / speech-bubbles / page-texts / page-lines)이 각자
 * "길이가 같은가 + 전부 이 페이지 소속인가" 만 봤다. 그건 집합 비교라 `["a","a"]` 가
 * 두 검사를 모두 통과한다 — 길이 2, 둘 다 소속. 그러면 트랜잭션이 같은 행에 order 0 과
 * 1 을 연달아 쓰고, 실제로 밀려나야 할 다른 행은 옛 order 를 그대로 들고 있는다.
 * 결과적으로 **두 항목이 같은 order 를 갖고**, 이후 `orderBy: { order }` 의 타이브레이크가
 * 요청마다 달라져 순서가 흔들린다(export 합성 순서·에디터 네비게이션에 그대로 나타난다).
 *
 * 중복을 막으면 나머지 두 조건과 합쳐 순열이 보장된다.
 */
export function isReorderPermutation(ids: string[], existingIds: ReadonlySet<string>): boolean {
  return (
    ids.length === existingIds.size &&
    new Set(ids).size === ids.length &&
    ids.every((id) => existingIds.has(id))
  );
}
