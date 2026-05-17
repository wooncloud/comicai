'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { api } from '@/lib/api';
import { ApiPaths, type PageDTO, type ProjectDTO } from '@comicai/types';
import { Button } from '@/components/ui/button';

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [pages, setPages] = useState<PageDTO[]>([]);

  async function loadProject() {
    setProject(await api<ProjectDTO>(ApiPaths.project(projectId)));
  }
  async function loadPages() {
    setPages(await api<PageDTO[]>(ApiPaths.projectPages(projectId)));
  }

  useEffect(() => {
    if (!projectId) return;
    void loadProject();
    void loadPages();
  }, [projectId]);

  async function addPage() {
    await api(ApiPaths.projectPages(projectId), {
      method: 'POST',
      body: JSON.stringify({ size: { w: 800, h: 1200 } }),
    });
    await loadPages();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">{project?.name ?? '로딩…'}</h1>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/consistency`}>일관성 관리</Link>
          </Button>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">페이지</h2>
            <Button onClick={addPage} variant="outline" size="sm">
              + 페이지 추가
            </Button>
          </div>
          {pages.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
              아직 페이지가 없습니다.
              <button onClick={addPage} className="ml-2 text-neutral-900 underline dark:text-white">
                첫 페이지 만들기
              </button>
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {pages.map((p) => (
                <PageCard key={p.id} projectId={projectId} page={p} onChanged={loadPages} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function PageCard({
  projectId,
  page,
  onChanged,
}: {
  projectId: string;
  page: PageDTO;
  onChanged: () => void;
}) {
  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`페이지 ${page.order + 1}을(를) 삭제하시겠습니까?`)) return;
    await api(ApiPaths.page(page.id), { method: 'DELETE' });
    onChanged();
  }
  return (
    <li className="group relative">
      <Link
        href={`/projects/${projectId}/pages/${page.id}`}
        className="block aspect-[2/3] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-400 hover:shadow-md dark:border-neutral-700"
      >
        <div className="flex h-full flex-col items-center justify-center text-neutral-700">
          <div className="text-3xl font-semibold">{page.order + 1}</div>
          <div className="mt-1 text-[10px] text-neutral-500">
            {page.size.w}×{page.size.h}
          </div>
        </div>
      </Link>
      <button
        onClick={remove}
        title="삭제"
        className="absolute right-1.5 top-1.5 rounded bg-white/80 px-1.5 py-0.5 text-xs text-red-600 opacity-0 shadow-sm transition group-hover:opacity-100 hover:bg-white dark:bg-neutral-900/80 dark:hover:bg-neutral-900"
      >
        삭제
      </button>
    </li>
  );
}
