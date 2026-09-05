/**
 * Prisma 의 Json 컬럼을 도메인 타입으로 읽는다. **null 을 남긴 채로.**
 *
 * `row.conti as ImageRef` 는 null 을 지운다. Prisma 가 돌려주는 값에는 null 이 들어
 * 있는데(컬럼이 `Json?` 이면 DB null, `Json` 이어도 JSON null 이 유효한 값이다) 캐스트가
 * 그걸 덮어써서 타입만 non-null 이 된다.
 *
 * 그러면 뒤따르는 `?? null` / `?? []` 가 lint 에 "불필요한 조건" 으로 보인다. 그 말을
 * 믿고 지우면 진짜 null 이 그대로 DTO 를 타고 나가고, 화면은 `undefined.storageKey` 에서
 * 죽는다 — **경고를 따르는 것이 버그를 만드는 자리다.**
 *
 * 캐스트 대신 이걸 쓰면 그 실수를 다시 할 수 없다.
 */
export function jsonColumn<T>(value: unknown): T | null {
  return (value ?? null) as T | null;
}
