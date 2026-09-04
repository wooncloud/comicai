'use client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ApiPaths } from '@comicai/types';
import { FEATURES } from './features';
import { qk } from './query-keys';

/**
 * 앱 내비게이션의 단일 출처.
 *
 * 예전에는 상단바 NAV, 아바타 드롭다운, 설정 탭이 각자 자기 목록을 들고 있어서
 * 같은 목적지가 세 번 나타났다. 실제로 "설정" 은 상단바와 드롭다운에 각각,
 * "계정 및 보안" 은 드롭다운과 설정 탭에 각각 있었다.
 *
 * 중복이 아닌 것처럼 보였던 것도 실은 같은 곳이었다:
 * `/projects` 는 `/dashboard` 로 redirect 하고(app/projects/page.tsx),
 * `/settings` 는 `/settings/profile` 로 redirect 한다(app/settings/page.tsx).
 * 그래서 "프로젝트 리스트"와 "대시보드", "설정"과 "프로필"은 각각 한 항목이다.
 */

/** 최상위 이동 지점. 상단바(데스크톱)와 드로어(모바일)가 공유한다. */
export const PRIMARY_NAV = [
  {
    href: '/dashboard',
    label: '내 프로젝트',
    // /projects/* 안에 있을 때도 이 항목이 켜져 있어야 현재 위치가 드러난다.
    match: (path: string) => path.startsWith('/dashboard') || path.startsWith('/projects'),
  },
  {
    href: '/settings/profile',
    label: '설정',
    match: (path: string) => path.startsWith('/settings'),
  },
] as const;

/**
 * 계정 설정의 하위 항목. `app/settings/layout.tsx` 의 탭과 모바일 드로어가 공유한다.
 *
 * 정확 일치로 판정한다 — `startsWith` 를 쓰면 앞으로 `/settings/profile/...` 같은
 * 하위 경로가 생겼을 때 두 항목이 동시에 켜진다.
 */
export const SETTINGS_NAV: readonly { href: string; label: string }[] = [
  { href: '/settings/profile', label: '프로필' },
  // 꺼져 있으면 탭 자체가 없다. 링크만 숨기고 라우트를 남겨 두면 주소를 아는
  // 사람에게는 그대로 열려 있게 된다 — 실제 차단은 서버 가드가 하지만,
  // 화면도 존재하지 않는 편이 일관적이다.
  ...(FEATURES.apiKeys ? [{ href: '/settings/api-keys', label: 'AI 서비스 키' }] : []),
  { href: '/settings/security', label: '계정 및 보안' },
];

/** 운영자에게만 보이는 항목. 서버가 내려준 `isAdmin` 이 참일 때만 붙인다. */
export const ADMIN_NAV = { href: '/admin', label: '운영 현황' } as const;

/**
 * 로그아웃. 상단바 드롭다운과 모바일 드로어가 **같은 함수**를 써야 한다.
 *
 * 두 벌로 두면 `setQueryData(qk.me(), null)` 같은 뒷정리를 한쪽에서만 빠뜨리기 쉽고,
 * 그러면 로그아웃했는데 아바타가 남아 있는 상태가 된다.
 */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async function logout() {
    try {
      await api(ApiPaths.logout, { method: 'POST' });
    } finally {
      /*
       * 캐시를 **비운다**. 갱신이 아니라 제거여야 한다.
       *
       * `setQueryData(qk.me(), null)` 은 "로그아웃 시각에 신선하게 저장된 null" 을
       * 남긴다. staleTime 30초 + refetchOnWindowFocus:false 라 그 30초 안에 다른
       * 사람이 로그인하면 재조회가 일어나지 않아, 로그인했는데 상단바에 로그인/가입
       * 버튼이 그대로 남았다. `qk.projects()` 도 지워지지 않아 대시보드에 **이전
       * 사용자의 프로젝트 이름**이 먼저 그려졌다.
       */
      queryClient.clear();
      router.push('/');
    }
  };
}
