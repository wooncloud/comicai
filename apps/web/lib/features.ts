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

  /**
   * 콘티(구도 스케치) 첨부.
   *
   * @deprecated 2026-09-25 화면에서 내렸다. 컷 하나를 그리려고 스케치를 따로 그려
   * 올리는 흐름이 실제로 쓰이지 않았고, 인스펙터에서 가장 큰 자리를 차지하고 있었다.
   * 코드와 API(`POST/DELETE /v1/panels/:id/conti`)는 남겨 둔다 — 이미 올린 콘티가
   * 있는 컷이 있고, 되살릴 때 다시 만들 이유가 없다.
   *
   * 환경변수가 아니라 여기 박아 둔 이유: 배포 설정이 아니라 **제품 결정**이다.
   * `as boolean` 은 타입이 `false` 로 좁혀져 쓰는 쪽이 죽은 코드로 보이는 것을 막는다.
   */
  conti: false as boolean,
} as const;
