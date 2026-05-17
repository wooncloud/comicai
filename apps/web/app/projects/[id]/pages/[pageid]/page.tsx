'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Editor, TLShapeId } from 'tldraw';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ApiPaths, pageLabel, type PageDTO, type PanelDTO } from '@comicai/types';
import { PanelInspector } from '@/components/editor/panel-inspector';
import { PageSidebar } from '@/components/editor/page-sidebar';
import { ToolToggle } from '@/components/editor/tool-toggle';
import { SaveStatus } from '@/components/editor/save-status';
import { ExportDialog } from '@/components/editor/export-dialog';
import { PageInspector } from '@/components/editor/page-inspector';
import { CollapseRail } from '@/components/editor/collapse-rail';
import { usePanelSync } from '@/components/editor/tldraw/use-panel-sync';
import { usePageFrame } from '@/components/editor/tldraw/use-page-frame';
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
  // 사이드/인스펙터 접힘 상태. localStorage에 저장해 페이지 전환 후에도 유지.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setLeftCollapsed(window.localStorage.getItem('editor.leftCollapsed') === '1');
    setRightCollapsed(window.localStorage.getItem('editor.rightCollapsed') === '1');
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('editor.leftCollapsed', leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('editor.rightCollapsed', rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

  useEffect(() => {
    if (!pageId) return;
    void (async () => {
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

  usePageFrame({
    editor,
    pageId,
    size: page?.size ?? null,
    label: page ? pageLabel(page) : 'page',
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
              { label: page ? pageLabel(page) : '…' },
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
        {leftCollapsed ? (
          <CollapseRail side="left" label="페이지" onExpand={() => setLeftCollapsed(false)} />
        ) : (
          <PageSidebar
            projectId={projectId}
            currentPageId={pageId}
            currentPage={page}
            onCollapse={() => setLeftCollapsed(true)}
          />
        )}
        <div className="relative flex-1 bg-muted/40">
          <ComicEditor onMount={setEditor} />
        </div>
        {rightCollapsed ? (
          <CollapseRail
            side="right"
            label={selected ? '패널' : '페이지'}
            onExpand={() => setRightCollapsed(false)}
          />
        ) : selected ? (
          <PanelInspector
            key={selected.id}
            projectId={projectId}
            panel={selected}
            onPanelUpdated={(p) => setPanels((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
            onPanelDeleted={() => {
              setPanels((prev) => prev.filter((x) => x.id !== selectedPanelId));
              setSelectedPanelId(null);
            }}
            onCollapse={() => setRightCollapsed(true)}
          />
        ) : page ? (
          <PageInspector
            page={page}
            onPageUpdated={setPage}
            onCollapse={() => setRightCollapsed(true)}
          />
        ) : (
          <aside className="w-72 border-l border-border bg-card" />
        )}
      </div>
    </div>
  );
}
