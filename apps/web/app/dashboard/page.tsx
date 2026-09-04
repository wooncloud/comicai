'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/shell/app-shell';
import { PageContainer } from '@/components/shell/page-container';
import { api } from '@/lib/api';
import { ApiPaths, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';
import { ProjectCreateDialog } from '@/components/dashboard/project-create-dialog';
import { ProjectRow } from '@/components/dashboard/project-row';
import { qk } from '@/lib/query-keys';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery<ProjectDTO[]>({
    queryKey: qk.projects(),
    queryFn: () => api<ProjectDTO[]>(ApiPaths.projects),
  });
  const [createOpen, setCreateOpen] = useState(false);

  function appendItem(created: ProjectDTO) {
    queryClient.setQueryData<ProjectDTO[]>(qk.projects(), (prev) =>
      prev ? [created, ...prev] : [created],
    );
  }
  function patchItem(next: ProjectDTO) {
    queryClient.setQueryData<ProjectDTO[]>(
      qk.projects(),
      (prev) => prev?.map((p) => (p.id === next.id ? next : p)) ?? prev,
    );
  }
  function removeItem(id: string) {
    queryClient.setQueryData<ProjectDTO[]>(
      qk.projects(),
      (prev) => prev?.filter((p) => p.id !== id) ?? prev,
    );
  }

  const empty = items?.length === 0;

  return (
    <AppShell>
      <PageContainer>
        <header className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-title-lg font-semibold sm:text-display-md">내 프로젝트</h1>
          {!empty && (
            <Button className="shrink-0" onClick={() => setCreateOpen(true)}>
              + 새 프로젝트
            </Button>
          )}
        </header>

        {isLoading && <p className="mt-10 text-body-sm text-muted-foreground">불러오는 중…</p>}

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
          <ul className="mt-8 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((p) => (
              <ProjectRow key={p.id} project={p} onPatched={patchItem} onRemoved={removeItem} />
            ))}
          </ul>
        )}

        <ProjectCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={appendItem}
        />
      </PageContainer>
    </AppShell>
  );
}
