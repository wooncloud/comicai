'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  ApiPaths,
  type ConsistencyEntityDTO,
  type EpisodeDTO,
  type PageDTO,
  type SessionUser,
} from '@comicai/types';
import { api } from './api';
import { qk } from './query-keys';

/**
 * 여러 화면이 함께 읽는 조회.
 *
 * 키는 `qk` 가 한 곳에서 만들지만, **키와 요청 주소의 짝**은 호출부마다 따로 적혀
 * 있었다 — 화 목록 세 곳, 설정집 세 곳, 내 정보 네 곳. 짝이 어긋나도 오류가 나지 않고
 * 한 캐시에 다른 모양이 섞일 뿐이라, 짝은 여기서만 만든다.
 *
 * 오류를 경계로 던질지는 호출부가 고른다. 같은 데이터라도 그 화면의 본문이면 던지고,
 * 브레드크럼·배너·요약 같은 곁가지면 삼킨다 — 한 줄 때문에 화면 전체가 오류로
 * 바뀌면 안 된다. 넘기지 않은 옵션은 전역 기본값(`app/providers.tsx`)을 따른다.
 */
type Opts<T> = Pick<UseQueryOptions<T>, 'throwOnError' | 'retry'>;

export function useMe(opts: Opts<SessionUser> = {}) {
  return useQuery<SessionUser>({
    queryKey: qk.me(),
    queryFn: () => api<SessionUser>(ApiPaths.me),
    ...opts,
  });
}

export function useProjectEpisodes(projectId: string, opts: Opts<EpisodeDTO[]> = {}) {
  return useQuery<EpisodeDTO[]>({
    queryKey: qk.projectEpisodes(projectId),
    queryFn: () => api<EpisodeDTO[]>(ApiPaths.projectEpisodes(projectId)),
    enabled: !!projectId,
    ...opts,
  });
}

/** 프로젝트의 모든 페이지. 화 순서 → 화 안의 순서로 온다. */
export function useProjectPages(projectId: string, opts: Opts<PageDTO[]> = {}) {
  return useQuery<PageDTO[]>({
    queryKey: qk.projectPages(projectId),
    queryFn: () => api<PageDTO[]>(ApiPaths.projectPages(projectId)),
    enabled: !!projectId,
    ...opts,
  });
}

/** 설정집 전체. 갈래(`type`)는 읽는 쪽이 거른다 — `qk.consistency` 주석 참고. */
export function useConsistency(projectId: string, opts: Opts<ConsistencyEntityDTO[]> = {}) {
  return useQuery<ConsistencyEntityDTO[]>({
    queryKey: qk.consistency(projectId),
    queryFn: () => api<ConsistencyEntityDTO[]>(ApiPaths.projectConsistency(projectId)),
    enabled: !!projectId,
    ...opts,
  });
}
