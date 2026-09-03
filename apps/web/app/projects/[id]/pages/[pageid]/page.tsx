'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Editor, TLShapeId } from 'tldraw';
import { api } from '@/lib/api';
import { useProject } from '@/lib/use-project';
import { useLocalStorageBoolean } from '@/lib/use-local-storage-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { MobileBlocker } from '@/components/shell/mobile-blocker';
import { Button } from '@/components/ui/button';
import {
  ApiPaths,
  pageLabel,
  type PageDTO,
  type PageLineDTO,
  type PageTextDTO,
  type PanelDTO,
  type SpeechBubbleDTO,
} from '@comicai/types';
import { PanelInspector } from '@/components/editor/panel-inspector';
import { SpeechBubbleInspector } from '@/components/editor/speech-bubble-inspector';
import { PageTextInspector } from '@/components/editor/page-text-inspector';
import { PageLineInspector } from '@/components/editor/page-line-inspector';
import { PageSidebar } from '@/components/editor/page-sidebar';
import { ToolRail } from '@/components/editor/tool-rail';
import { SaveStatus } from '@/components/editor/save-status';
import { ExportDialog } from '@/components/editor/export-dialog';
import { PageInspector } from '@/components/editor/page-inspector';
import { CollapseRail } from '@/components/editor/collapse-rail';
import { usePanelSync } from '@/components/editor/tldraw/use-panel-sync';
import { useSpeechBubbleSync } from '@/components/editor/tldraw/use-speech-bubble-sync';
import { usePageTextSync } from '@/components/editor/tldraw/use-page-text-sync';
import { usePageLineSync } from '@/components/editor/tldraw/use-page-line-sync';
import { usePageFrame } from '@/components/editor/tldraw/use-page-frame';
import type { ComicPanelShape } from '@/components/editor/tldraw/comic-panel-shape';
import type { SpeechBubbleShape } from '@/components/editor/tldraw/speech-bubble-shape';
import type { PageTextShape } from '@/components/editor/tldraw/page-text-shape';
import type { PageLineShape } from '@/components/editor/tldraw/page-line-shape';

const ComicEditor = dynamic(
  () => import('@/components/editor/tldraw/comic-editor').then((m) => m.ComicEditor),
  { ssr: false, loading: () => <CanvasFallback /> },
);

type Selection =
  | { kind: 'panel'; id: string }
  | { kind: 'bubble'; shape: SpeechBubbleShape }
  | { kind: 'text'; shape: PageTextShape }
  | { kind: 'line'; shape: PageLineShape }
  | null;

function CanvasFallback() {
  return (
    <div className="flex h-full items-center justify-center text-body-sm text-muted-foreground">
      에디터 불러오는 중…
    </div>
  );
}

export default function PageEditor() {
  const params = useParams<{ id: string; pageid: string }>();
  const { id: projectId, pageid: pageId } = params;
  const project = useProject(projectId);
  const [page, setPage] = useState<PageDTO | null>(null);
  const [panels, setPanels] = useState<PanelDTO[]>([]);
  const [bubbles, setBubbles] = useState<SpeechBubbleDTO[]>([]);
  const [texts, setTexts] = useState<PageTextDTO[]>([]);
  const [lines, setLines] = useState<PageLineDTO[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useLocalStorageBoolean('editor.leftCollapsed');
  const [rightCollapsed, setRightCollapsed] = useLocalStorageBoolean('editor.rightCollapsed');

  useEffect(() => {
    if (!pageId) return;
    void (async () => {
      const [p, list, bubs, txs, lns] = await Promise.all([
        api<PageDTO>(ApiPaths.page(pageId)),
        api<PanelDTO[]>(ApiPaths.pagePanels(pageId)),
        api<SpeechBubbleDTO[]>(ApiPaths.pageSpeechBubbles(pageId)),
        api<PageTextDTO[]>(ApiPaths.pagePageTexts(pageId)),
        api<PageLineDTO[]>(ApiPaths.pagePageLines(pageId)),
      ]);
      setPage(p);
      setPanels(list);
      setBubbles(bubs);
      setTexts(txs);
      setLines(lns);
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

  useSpeechBubbleSync({
    editor,
    pageId,
    bubbles,
    onBubblesChanged: setBubbles,
    onSavingChange,
    onSaveError,
  });

  usePageTextSync({
    editor,
    pageId,
    texts,
    onTextsChanged: setTexts,
    onSavingChange,
    onSaveError,
  });

  usePageLineSync({
    editor,
    pageId,
    lines,
    onLinesChanged: setLines,
    onSavingChange,
    onSaveError,
  });

  usePageFrame({
    editor,
    pageId,
    size: page?.size ?? null,
    label: page ? pageLabel(page) : 'page',
  });

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const ids = editor.getSelectedShapeIds();
      if (ids.length === 0) return setSelection(null);
      const shape = editor.getShape(ids[0] as TLShapeId);
      if (shape?.type === 'comic-panel') {
        const panelId = (shape as ComicPanelShape).props.panelId;
        setSelection(panelId ? { kind: 'panel', id: panelId } : null);
      } else if (shape?.type === 'speech-bubble') {
        setSelection({ kind: 'bubble', shape: shape as SpeechBubbleShape });
      } else if (shape?.type === 'page-text') {
        setSelection({ kind: 'text', shape: shape as PageTextShape });
      } else if (shape?.type === 'page-line') {
        setSelection({ kind: 'line', shape: shape as PageLineShape });
      } else {
        setSelection(null);
      }
    };
    const unsub = editor.store.listen(sync, { source: 'user' });
    sync();
    return () => unsub();
  }, [editor]);

  const selectedPanel = useMemo(
    () =>
      selection?.kind === 'panel' ? (panels.find((p) => p.id === selection.id) ?? null) : null,
    [panels, selection],
  );

  return (
    <div className="flex h-dvh flex-col">
      {/* 캔버스 조작이 필요한 유일한 화면이라 여기서만 작은 화면을 막는다. */}
      <MobileBlocker backHref={`/projects/${projectId}`} />
      <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <Breadcrumb
            items={[
              { label: '대시보드', href: '/dashboard' },
              { label: project?.name ?? '…', href: `/projects/${projectId}` },
              { label: page ? pageLabel(page) : '…' },
            ]}
          />
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
          <CollapseRail side="left" onExpand={() => setLeftCollapsed(false)} />
        ) : (
          <>
            <PageSidebar
              projectId={projectId}
              currentPageId={pageId}
              currentPage={page}
              onCollapse={() => setLeftCollapsed(true)}
            />
            <ToolRail editor={editor} />
          </>
        )}
        <div className="relative flex-1 bg-muted/40">
          <ComicEditor onMount={setEditor} />
        </div>
        {rightCollapsed ? (
          <CollapseRail side="right" onExpand={() => setRightCollapsed(false)} />
        ) : selectedPanel ? (
          <PanelInspector
            key={selectedPanel.id}
            projectId={projectId}
            panel={selectedPanel}
            onPanelUpdated={(p) => setPanels((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
            onPanelDeleted={() => {
              setPanels((prev) => prev.filter((x) => x.id !== selectedPanel.id));
              setSelection(null);
            }}
            onCollapse={() => setRightCollapsed(true)}
          />
        ) : selection?.kind === 'bubble' && editor ? (
          <SpeechBubbleInspector
            key={selection.shape.id}
            editor={editor}
            shapeId={selection.shape.id}
            shape={selection.shape}
            onCollapse={() => setRightCollapsed(true)}
          />
        ) : selection?.kind === 'text' && editor ? (
          <PageTextInspector
            key={selection.shape.id}
            editor={editor}
            shapeId={selection.shape.id}
            shape={selection.shape}
            onCollapse={() => setRightCollapsed(true)}
          />
        ) : selection?.kind === 'line' && editor ? (
          <PageLineInspector
            key={selection.shape.id}
            editor={editor}
            shapeId={selection.shape.id}
            shape={selection.shape}
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
