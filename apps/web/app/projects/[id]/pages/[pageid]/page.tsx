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
import { errorMessage } from '@/lib/error-message';
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

/*
 * ToolRail 도 경계 안으로 미룬다.
 *
 * 이 컴포넌트는 현재 도구를 `useValue`(tldraw 런타임 값)로 읽는데, 그 한 줄 때문에
 * 정적 import 사슬이 tldraw 번들 전체를 끌어왔다 — 위 `dynamic()` 이 미루려던 바로
 * 그것이다. 캔버스와 함께 나타나는 UI 라 같이 미뤄도 어색하지 않다.
 */
const ToolRail = dynamic(() => import('@/components/editor/tool-rail').then((m) => m.ToolRail), {
  ssr: false,
});

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
  const [loadError, setLoadError] = useState<unknown>(null);
  /** "다시 시도" 가 로드 이펙트를 다시 돌리게 하는 값. */
  const [reloadKey, setReloadKey] = useState(0);

  /*
   * 이 화면의 주 데이터는 react-query 밖이라 전역 오류 경계가 덮지 못한다.
   * (에디터는 캔버스 상태를 직접 들고 있어야 해서 아직 옮기지 못했다.)
   *
   * 그래서 실패를 여기서 직접 다룬다. 예전에는 `catch` 가 없어 하나만 실패해도
   * 다섯 setState 가 전부 건너뛰어졌고, 화면은 **빈 캔버스에 오류 표시도 없이**
   * 남았다 — 사용자는 자기 컷이 다 사라진 줄 안다.
   *
   * `cancelled` 가드도 같이 넣는다. 없으면 페이지를 빠르게 전환할 때 늦게 온
   * 응답이 다른 페이지의 컷을 덮어쓴다.
   */
  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const [p, list, bubs, txs, lns] = await Promise.all([
          api<PageDTO>(ApiPaths.page(pageId)),
          api<PanelDTO[]>(ApiPaths.pagePanels(pageId)),
          api<SpeechBubbleDTO[]>(ApiPaths.pageSpeechBubbles(pageId)),
          api<PageTextDTO[]>(ApiPaths.pagePageTexts(pageId)),
          api<PageLineDTO[]>(ApiPaths.pagePageLines(pageId)),
        ]);
        if (cancelled) return;
        setPage(p);
        setPanels(list);
        setBubbles(bubs);
        setTexts(txs);
        setLines(lns);
      } catch (err) {
        if (!cancelled) setLoadError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, reloadKey]);

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

    function compute(): Selection | null {
      const ids = editor!.getSelectedShapeIds();
      if (ids.length === 0) return null;
      const shape = editor!.getShape(ids[0] as TLShapeId);
      if (shape?.type === 'comic-panel') {
        const panelId = (shape as ComicPanelShape).props.panelId;
        return panelId ? { kind: 'panel', id: panelId } : null;
      }
      if (shape?.type === 'speech-bubble')
        return { kind: 'bubble', shape: shape as SpeechBubbleShape };
      if (shape?.type === 'page-text') return { kind: 'text', shape: shape as PageTextShape };
      if (shape?.type === 'page-line') return { kind: 'line', shape: shape as PageLineShape };
      return null;
    }

    /*
     * 같은 선택이면 setState 를 건너뛴다.
     *
     * tldraw 는 **모든 pointer_move 마다 store 에 pointer 레코드를 쓴다.** 그래서
     * 이 리스너가 60~120Hz 로 깨어나는데, 매번 새 객체를 넣으면 에디터 트리 전체가
     * (사이드바 · 툴레일 · tiptap · 히스토리 그리드까지) 그만큼 다시 그려진다.
     * scope 필터로는 못 거른다 — 선택 상태(instance_page_state)도 pointer 와 같은
     * 'session' scope 라 같이 걸러지기 때문이다.
     *
     * shape 레코드는 불변이라 바뀌지 않으면 참조가 그대로다. 참조 비교로 충분하다.
     */
    function same(a: Selection | null, b: Selection | null): boolean {
      if (a === b) return true;
      if (!a || a.kind !== b?.kind) return false;
      if (a.kind === 'panel') return a.id === (b as typeof a).id;
      return a.shape === (b as typeof a).shape;
    }

    let prev: Selection | null = null;
    const sync = () => {
      const next = compute();
      if (same(prev, next)) return;
      prev = next;
      setSelection(next);
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

  /*
   * 실패했으면 캔버스를 아예 그리지 않는다. 빈 캔버스를 띄우면 사용자가 자기 컷이
   * 사라진 것으로 읽고, 거기서 뭔가 그리면 그건 정말로 덮어쓰기가 된다.
   */
  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-title-lg font-semibold">페이지를 불러오지 못했습니다</h1>
        <p className="text-body-sm text-muted-foreground [text-wrap:pretty]">
          {errorMessage(loadError)}
        </p>
        <p className="text-caption text-muted-foreground">저장된 작업이 사라진 것은 아닙니다.</p>
        <div className="mt-2 flex gap-2">
          <Button onClick={() => setReloadKey((k) => k + 1)}>다시 시도</Button>
          <Button variant="outline" asChild>
            <a href={`/projects/${projectId}`}>프로젝트로</a>
          </Button>
        </div>
      </div>
    );
  }

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
          // 아무것도 선택하지 않았을 때의 빈 자리. 폭이 InspectorShell 과 같아야
          // 선택할 때 캔버스가 흔들리지 않는다.
          <aside className="w-80 border-l border-border bg-card" />
        )}
      </div>
    </div>
  );
}
