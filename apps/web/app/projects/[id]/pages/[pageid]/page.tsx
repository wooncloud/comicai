'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PageDTO, PanelDTO, PanelShape } from '@comicai/types';
import { PageCanvas } from '@/components/editor/page-canvas';
import { PanelInspector } from '@/components/editor/panel-inspector';

export default function PageEditor() {
  const params = useParams<{ id: string; pageid: string }>();
  const { id: projectId, pageid: pageId } = params;
  const [page, setPage] = useState<PageDTO | null>(null);
  const [panels, setPanels] = useState<PanelDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function refreshPanels() {
    const list = await api<PanelDTO[]>(`/pages/${pageId}/panels`);
    setPanels(list);
  }

  useEffect(() => {
    if (!projectId || !pageId) return;
    (async () => {
      const pages = await api<PageDTO[]>(`/projects/${projectId}/pages`);
      const p = pages.find((x) => x.id === pageId) ?? null;
      setPage(p);
      await refreshPanels();
    })();
  }, [projectId, pageId]);

  async function createPanel(shape: PanelShape) {
    const created = await api<PanelDTO>(`/pages/${pageId}/panels`, {
      method: 'POST',
      body: JSON.stringify({ shape }),
    });
    setPanels((prev) => [...prev, created]);
    setSelectedId(created.id);
  }

  const selected = panels.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-neutral-500 hover:underline">
            ← 프로젝트로
          </Link>
          <h1 className="text-base font-semibold">
            페이지 {page ? page.order + 1 : '…'} 편집
          </h1>
        </div>
        <div className="text-xs text-neutral-500">
          패널 {panels.length}개 · 드래그로 새 패널 생성
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto bg-neutral-100 p-6 dark:bg-neutral-900">
          <div className="mx-auto" style={{ width: 'fit-content' }}>
            {page && (
              <PageCanvas
                width={page.size.w}
                height={page.size.h}
                panels={panels}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCreate={createPanel}
              />
            )}
          </div>
        </div>
        {selected ? (
          <PanelInspector
            projectId={projectId}
            panel={selected}
            onPanelUpdated={(p) =>
              setPanels((prev) => prev.map((x) => (x.id === p.id ? p : x)))
            }
            onPanelDeleted={() => {
              setPanels((prev) => prev.filter((x) => x.id !== selectedId));
              setSelectedId(null);
            }}
          />
        ) : (
          <aside className="flex w-96 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            패널을 선택하거나 캔버스에서 드래그해 새로 만드세요.
          </aside>
        )}
      </div>
    </div>
  );
}
