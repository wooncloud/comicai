'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ProjectDTO } from '@comicai/types';

export function useProject(projectId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectDTO>(`/projects/${projectId}`),
    enabled: !!projectId,
  });
  return data ?? null;
}
