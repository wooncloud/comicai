import type { EntityType } from '@comicai/types';

/**
 * react-query 캐시 키를 한 곳에서 만든다.
 *
 * 호출부마다 배열 리터럴을 적으면 읽는 쪽과 무효화하는 쪽의 키가 어긋나도
 * 아무 에러가 없다 — 화면이 그냥 갱신되지 않고, 원인을 찾기 어렵다.
 * (실제로 프로필을 저장해도 상단바 아바타가 그대로였던 적이 있다.)
 *
 * 키를 바꿔야 하면 여기만 고치면 되고, 오타는 컴파일 에러가 된다.
 */
export const qk = {
  /** 로그인한 사용자. Topbar·설정 화면이 공유한다. */
  me: () => ['me'] as const,

  /** 켜져 있는 소셜 로그인 제공자. 로그인·가입·보안 설정이 공유한다. */
  oauthProviders: () => ['oauth-providers'] as const,

  /** 대시보드의 프로젝트 목록. */
  projects: () => ['projects'] as const,

  /** 운영 현황 화면. `isAdmin` 이 참일 때만 조회한다. */
  adminOverview: () => ['admin', 'overview'] as const,
  adminUsers: () => ['admin', 'users'] as const,
  /** 입금 확인 대기 주문. 지급하면 adminUsers 의 잔액도 같이 바뀐다. */
  adminOrders: () => ['admin', 'orders'] as const,

  /** 단일 프로젝트. 라우트 파라미터가 아직 없을 수 있어 undefined 를 받는다(enabled 로 막는다). */
  project: (projectId: string | undefined) => ['project', projectId] as const,

  /** 패널의 렌더 잡 이력. */
  panelHistory: (panelId: string) => ['panel-history', panelId] as const,

  /** 단일 렌더 잡. SSE 로 상태가 갱신된다. */
  renderJob: (jobId: string | null) => ['render-job', jobId] as const,

  /** 프로젝트의 페이지 목록. 상세 화면과 에디터 사이드바가 공유한다. */
  projectPages: (projectId: string) => ['project-pages', projectId] as const,

  /** 로그인된 기기 목록. */
  meSessions: () => ['me-sessions'] as const,

  /** 토큰 잔액. 에디터 헤더와 충전 화면이 공유한다 — 렌더가 끝나면 둘 다 갱신돼야 한다. */
  tokenBalance: () => ['token-balance'] as const,
  tokenHistory: () => ['token-history'] as const,
  billingPackages: () => ['billing-packages'] as const,
  billingOrders: () => ['billing-orders'] as const,

  /** 프로젝트의 일관성 엔티티. 타입을 주면 그 타입만. */
  consistency: (projectId: string, type?: EntityType) =>
    type ? (['consistency', projectId, type] as const) : (['consistency', projectId] as const),
} as const;
