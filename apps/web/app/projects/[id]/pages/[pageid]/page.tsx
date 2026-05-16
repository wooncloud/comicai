'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import { btnSecondaryXs } from '@/lib/ui-classes';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import type { PageDTO, PanelDTO, PanelShape } from '@comicai/types';
import { PageCanvas } from '@/components/editor/page-canvas';
import { PanelInspector } from '@/components/editor/panel-inspector';
import { useToast } from '@/components/ui/toast';

export default function PageEditor() {
  const params = useParams<{ id: string; pageid: string }>();
  const { id: projectId, pageid: pageId } = params;
  const project = useProject(projectId);
  const [page, setPage] = useState<PageDTO | null>(null);
  const [panels, setPanels] = useState<PanelDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  async function exportPage(format: 'png' | 'jpg') {
    setExporting(true);
    try {
      const result = await api<{ storageKey: string }>(`/pages/${pageId}/export`, {
        method: 'POST',
        body: JSON.stringify({ format }),
      });
      toast.push('success', `내보내기 완료: ${result.storageKey}`);
    } catch (err) {
      toast.push('error', `내보내기 실패: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      const [p, list] = await Promise.all([
        api<PageDTO>(`/pages/${pageId}`),
        api<PanelDTO[]>(`/pages/${pageId}/panels`),
      ]);
      setPage(p);
      setPanels(list);
    })();
  }, [pageId]);

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
        <Breadcrumb
          items={[
            { label: '프로젝트', href: '/projects' },
            { label: project?.name ?? '…', href: `/projects/${projectId}` },
            { label: `페이지 ${page ? page.order + 1 : '…'}` },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            패널 {panels.length}개 · 드래그로 새 패널 생성
          </span>
          <button onClick={() => exportPage('png')} disabled={exporting} className={btnSecondaryXs}>
            PNG 내보내기
          </button>
          <button onClick={() => exportPage('jpg')} disabled={exporting} className={btnSecondaryXs}>
            JPG 내보내기
          </button>
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
          <aside className="flex w-64 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50 p-6 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-2xl text-neutral-300 dark:text-neutral-700">◯</div>
            <p className="mt-3">
              패널을 선택하거나
              <br />
              캔버스에서 드래그해 만드세요.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
