'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { ProjectDTO } from '@comicai/types';

export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<ProjectDTO | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    api<ProjectDTO>(`/projects/${projectId}`)
      .then((p) => active && setProject(p))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);
  return project;
}
