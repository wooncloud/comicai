'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { qk } from '@/lib/query-keys';

export function useProject(projectId: string | undefined) {
  const { data } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => api<ProjectDTO>(ApiPaths.project(projectId!)),
    enabled: !!projectId,
  });
  return data ?? null;
}
