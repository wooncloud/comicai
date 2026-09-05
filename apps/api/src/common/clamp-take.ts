/**
 * 목록 조회의 `?limit=` 를 안전한 범위로 접는다.
 *
 * 세 곳이 각자 접고 있었고 **동작이 갈려 있었다** — 관리자 두 곳은 빈 값에 50을 줬는데
 * 토큰 내역은 컨트롤러와 서비스가 절반씩 나눠 접느라 같은 빈 값에 1을 줬다. 목록 API 의
 * 기본 개수가 화면마다 다른 것은 아무도 의도한 적이 없다.
 */
export function clampTake(limit: string | undefined, fallback = 50): number {
  return Math.min(Math.max(Number(limit) || fallback, 1), 200);
}
