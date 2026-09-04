import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'comicai:public';

/**
 * 이 컨트롤러(또는 라우트)는 세션 없이 들어올 수 있다.
 *
 * `SessionGuard` 가 전역 가드라 **기본값이 "로그인 필요"** 다. 예전에는 컨트롤러마다
 * `@UseGuards(SessionGuard)` 를 붙이는 방식이라, 가드를 빠뜨린 새 컨트롤러는 인증도
 * CSRF 도 없는 상태가 됐다 — `csrf.middleware.ts` 가 "세션 쿠키 없는 요청" 을 통과시키기
 * 때문이다(가드가 401 로 막아 줄 것을 전제한다). 두 밑단이 서로를 전제하는데 그중 하나가
 * opt-in 이면, 잊었을 때 둘 다 사라진다.
 *
 * 그래서 뒤집었다. 공개가 필요한 곳만 여기에 명시적으로 표시한다 — 잊으면 열리는 게
 * 아니라 잠긴다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
