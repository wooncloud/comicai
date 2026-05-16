'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { api } from '@/lib/api';
import type { PageDTO, ProjectDTO } from '@comicai/types';

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [pages, setPages] = useState<PageDTO[]>([]);

  async function refresh() {
    const [p, pg] = await Promise.all([
      api<ProjectDTO>(`/projects/${projectId}`),
      api<PageDTO[]>(`/projects/${projectId}/pages`),
    ]);
    setProject(p);
    setPages(pg);
  }

  useEffect(() => {
    if (projectId) refresh();
  }, [projectId]);

  async function addPage() {
    await api(`/projects/${projectId}/pages`, {
      method: 'POST',
      body: JSON.stringify({ size: { w: 800, h: 1200 } }),
    });
    await refresh();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">{project?.name ?? '로딩…'}</h1>
          <Link
            href={`/projects/${projectId}/consistency`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            일관성 관리
          </Link>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">페이지</h2>
            <button
              onClick={addPage}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              + 페이지 추가
            </button>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {pages.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${projectId}/pages/${p.id}`}
                  className="block aspect-[2/3] rounded border border-neutral-200 bg-white p-3 text-sm hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="text-xs text-neutral-500">페이지</div>
                  <div className="text-2xl font-semibold">{p.order + 1}</div>
                  <div className="mt-2 text-xs text-neutral-500">
                    {p.size.w}×{p.size.h}
                  </div>
                </Link>
              </li>
            ))}
            {pages.length === 0 && (
              <li className="col-span-full text-sm text-neutral-500">아직 페이지가 없습니다.</li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
