'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Editor, TLShapeId } from 'tldraw';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ApiPaths, type PageDTO, type PanelDTO } from '@comicai/types';
import { PanelInspector } from '@/components/editor/panel-inspector';
import { PageSidebar } from '@/components/editor/page-sidebar';
import { ToolToggle } from '@/components/editor/tool-toggle';
import { SaveStatus } from '@/components/editor/save-status';
import { ExportDialog } from '@/components/editor/export-dialog';
import { usePanelSync } from '@/components/editor/tldraw/use-panel-sync';
import type { ComicPanelShape } from '@/components/editor/tldraw/comic-panel-shape';

const ComicEditor = dynamic(
  () => import('@/components/editor/tldraw/comic-editor').then((m) => m.ComicEditor),
  { ssr: false, loading: () => <CanvasFallback /> },
);

function CanvasFallback() {
  return (
    <div className="flex h-full items-center justify-center text-body-sm text-muted-foreground">
      에디터 로딩…
    </div>
  );
}

export default function PageEditor() {
  const params = useParams<{ id: string; pageid: string }>();
  const { id: projectId, pageid: pageId } = params;
  const project = useProject(projectId);
  const [page, setPage] = useState<PageDTO | null>(null);
  const [panels, setPanels] = useState<PanelDTO[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      const [p, list] = await Promise.all([
        api<PageDTO>(ApiPaths.page(pageId)),
        api<PanelDTO[]>(ApiPaths.pagePanels(pageId)),
      ]);
      setPage(p);
      setPanels(list);
    })();
  }, [pageId]);

  const onSavingChange = useCallback((v: boolean) => {
    setSaveState((prev) => (v ? 'saving' : prev === 'error' ? 'error' : 'idle'));
    if (!v) setLastSavedAt(Date.now());
  }, []);

  const onSaveError = useCallback(() => setSaveState('error'), []);

  usePanelSync({
    editor,
    pageId,
    panels,
    onPanelsChanged: setPanels,
    onSavingChange,
    onSaveError,
  });

  // tldraw selection ↔ selectedPanelId
  useEffect(() => {
    if (!editor) return;
    const unsub = editor.store.listen(
      () => {
        const ids = editor.getSelectedShapeIds();
        if (ids.length === 0) {
          setSelectedPanelId(null);
          return;
        }
        const shape = editor.getShape(ids[0] as TLShapeId);
        if (shape?.type === 'comic-panel') {
          setSelectedPanelId((shape as ComicPanelShape).props.panelId);
        }
      },
      { source: 'user' },
    );
    return () => unsub();
  }, [editor]);

  const selected = useMemo(
    () => panels.find((p) => p.id === selectedPanelId) ?? null,
    [panels, selectedPanelId],
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <Breadcrumb
            items={[
              { label: '대시보드', href: '/dashboard' },
              { label: project?.name ?? '…', href: `/projects/${projectId}` },
              { label: `p${page ? page.order + 1 : '…'}` },
            ]}
          />
          <ToolToggle editor={editor} />
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            내보내기
          </Button>
        </div>
      </header>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        pageId={pageId}
        panels={panels}
      />

      <div className="flex flex-1 overflow-hidden">
        <PageSidebar projectId={projectId} currentPageId={pageId} />
        <div className="relative flex-1 bg-muted/40">
          <ComicEditor onMount={setEditor} />
        </div>
        {selected ? (
          <PanelInspector
            projectId={projectId}
            panel={selected}
            onPanelUpdated={(p) => setPanels((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
            onPanelDeleted={() => {
              setPanels((prev) => prev.filter((x) => x.id !== selectedPanelId));
              setSelectedPanelId(null);
            }}
          />
        ) : (
          <aside className="flex w-72 flex-col items-center justify-center border-l border-border bg-card p-6 text-center text-body-sm text-muted-foreground">
            <div className="text-display-md text-muted-foreground/30">◯</div>
            <p className="mt-3">
              패널을 선택하거나
              <br />P 도구로 새 패널을 그려보세요.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
