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
  const {
    data: items,
    isLoading,
    isError,
    refetch,
  } = useQuery<ProjectDTO[]>({
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

  // 오류로 undefined 인 것과 정말 비어 있는 것을 구분한다.
  const empty = !isError && items?.length === 0;

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

        {/*
          예전에는 isError 를 다루는 코드가 앱 전체에 하나도 없었다. API 가 500 을 주면
          items 가 undefined 가 되어 아래 빈 상태가 뜨는데, 그러면 화면이
          "프로젝트가 없다" 고 말한다 — 사용자는 자기 작업이 사라진 줄 안다.
        */}
        {isError && (
          <div className="mt-10 rounded-lg border border-destructive/40 p-6 text-center">
            <p className="text-body-sm">목록을 불러오지 못했습니다.</p>
            <p className="mt-1 text-caption text-muted-foreground">
              작업이 사라진 것은 아닙니다. 연결을 확인하고 다시 시도해 주세요.
            </p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        )}

        {empty && (
          <div className="mt-10 rounded-lg border border-dashed border-border bg-muted/30 p-16 text-center">
            <h2 className="text-title-lg font-medium">아직 작품이 없어요</h2>
            <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground [text-wrap:pretty]">
              작품을 만들면 페이지를 추가하고, 페이지 안에 컷을 그린 뒤, 컷마다 어떤 장면인지
              문장으로 적으면 그림이 만들어집니다.
            </p>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>
              + 새 프로젝트 만들기
            </Button>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="mt-10 divide-y divide-border overflow-hidden rounded-lg border border-border">
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
