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

        {/*
          5xx·네트워크 실패는 여기서 다루지 않는다 — app/providers.tsx 가 던지고
          app/error.tsx 가 받는다.

          다만 401 은 던지지 않기로 했으므로(Topbar 가 /login 으로 보낸다) `items` 가
          undefined 인 채로 여기 도달할 수 있다. 그때 목록 분기로 떨어지면 테두리만
          있는 빈 상자가 보인다 — 마지막 분기를 `items` 가 있을 때로 좁힌다.
        */}
        {isLoading ? (
          <p className="mt-10 text-body-sm text-muted-foreground">불러오는 중…</p>
        ) : empty ? (
          <div className="mt-10 rounded-lg border border-dashed border-border bg-muted/30 p-16 text-center">
            <h2 className="text-title-lg font-medium">아직 프로젝트가 없어요</h2>
            <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground [text-wrap:pretty]">
              프로젝트를 만들면 페이지를 추가하고, 페이지 안에 컷을 그린 뒤, 컷마다 어떤 장면인지
              문장으로 적으면 그림이 만들어집니다.
            </p>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>
              + 새 프로젝트 만들기
            </Button>
          </div>
        ) : items ? (
          <ul className="mt-10 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((p) => (
              <ProjectRow key={p.id} project={p} onPatched={patchItem} onRemoved={removeItem} />
            ))}
          </ul>
        ) : null}

        <ProjectCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={appendItem}
        />
      </PageContainer>
    </AppShell>
  );
}
