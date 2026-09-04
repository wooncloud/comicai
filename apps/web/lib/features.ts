import { isFlagOn } from '@comicai/types';

/**
 * 웹에서 읽는 기능 플래그.
 *
 * Next.js 는 `NEXT_PUBLIC_` 접두사가 붙은 값만 브라우저 번들에 넣는다. 그래서
 * 서버(`FEATURE_API_KEYS`)와 이름이 달라질 수밖에 없다 — 켤 때 **둘 다** 켜야 한다.
 * 한쪽만 켜면 화면은 있는데 API 가 404 이거나, 화면은 없는데 API 는 열린 상태가 된다.
 *
 * 해석 규칙은 `@comicai/types` 의 `isFlagOn` 하나만 쓴다. 한쪽은 `'true'`,
 * 다른 쪽은 `'1'` 을 참으로 읽는 식의 어긋남을 막기 위해서다.
 *
 * 값이 빌드 시점에 박히므로 `process.env.NEXT_PUBLIC_...` 를 통째로 적어야 한다
 * (변수로 감싸면 Next 의 치환이 동작하지 않는다).
 */
export const FEATURES = {
  /**
   * 사용자가 자기 AI 서비스 키를 직접 넣는 기능(BYOK).
   *
   * 결제 + 사용량 과금으로 방향을 바꾸는 중이라 기본은 꺼짐이다.
   * 끄면 그림 생성에 쓸 키를 새로 등록할 수 없다는 점에 주의 — .env.example 참고.
   */
  apiKeys: isFlagOn(process.env.NEXT_PUBLIC_FEATURE_API_KEYS),
} as const;
