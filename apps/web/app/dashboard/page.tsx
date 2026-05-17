'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/shell/app-shell';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { ProjectCreateDialog } from '@/components/dashboard/project-create-dialog';
import { ProjectCard } from '@/components/dashboard/project-card';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery<ProjectDTO[]>({
    queryKey: ['projects'],
    queryFn: () => api<ProjectDTO[]>(ApiPaths.projects),
  });
  const [createOpen, setCreateOpen] = useState(false);

  function appendItem(created: ProjectDTO) {
    queryClient.setQueryData<ProjectDTO[]>(['projects'], (prev) =>
      prev ? [created, ...prev] : [created],
    );
  }
  function patchItem(next: ProjectDTO) {
    queryClient.setQueryData<ProjectDTO[]>(
      ['projects'],
      (prev) => prev?.map((p) => (p.id === next.id ? next : p)) ?? prev,
    );
  }
  function removeItem(id: string) {
    queryClient.setQueryData<ProjectDTO[]>(
      ['projects'],
      (prev) => prev?.filter((p) => p.id !== id) ?? prev,
    );
  }

  const empty = items?.length === 0;

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex items-baseline justify-between">
          <h1 className="text-display-md font-semibold">내 프로젝트</h1>
          {!empty && <Button onClick={() => setCreateOpen(true)}>+ 새 프로젝트</Button>}
        </header>

        {isLoading && <p className="mt-10 text-body-sm text-muted-foreground">로딩…</p>}

        {empty && (
          <div className="mt-16 rounded-lg border border-dashed border-border bg-muted/30 p-16 text-center">
            <h2 className="text-title-lg font-medium">아직 프로젝트가 없어요</h2>
            <p className="mt-2 text-body-sm text-muted-foreground">첫 번째 만화를 시작해 보세요.</p>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>
              + 새 프로젝트 만들기
            </Button>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} onPatched={patchItem} onRemoved={removeItem} />
            ))}
          </ul>
        )}

        <ProjectCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={appendItem}
        />
      </main>
    </AppShell>
  );
}
