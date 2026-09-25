'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { qk } from '@/lib/query-keys';

export function useProject(
  projectId: string | undefined,
  opts: Pick<UseQueryOptions<ProjectDTO>, 'throwOnError'> = {},
) {
  const { data } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => api<ProjectDTO>(ApiPaths.project(projectId!)),
    enabled: !!projectId,
    ...opts,
  });
  return data ?? null;
}
