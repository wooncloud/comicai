'use client';
import { useCallback } from 'react';
import { Tldraw, type Editor, type TLComponents, type TLShapeId, type TLUiOverrides } from 'tldraw';
import 'tldraw/tldraw.css';
import { ComicPanelShapeUtil } from './comic-panel-shape';
import { ComicPanelTool } from './comic-panel-tool';
import { PageFrameShapeUtil } from './page-frame-shape';
import { PolygonPanelTool } from './polygon-panel-tool';
import { PolygonPreview } from './polygon-preview';
import { SpeechBubbleShapeUtil } from './speech-bubble-shape';
import { ALL_BUBBLE_TOOLS } from './speech-bubble-tools';
import { PageTextShapeUtil } from './page-text-shape';
import { PageTextTool } from './page-text-tool';

const shapeUtils = [
  ComicPanelShapeUtil,
  PageFrameShapeUtil,
  SpeechBubbleShapeUtil,
  PageTextShapeUtil,
];
const tools = [ComicPanelTool, PolygonPanelTool, PageTextTool, ...ALL_BUBBLE_TOOLS];

const uiOverrides: TLUiOverrides = {
  tools(_editor, baseTools) {
    return {
      ...baseTools,
      'comic-panel': {
        id: 'comic-panel',
        icon: 'geo-rectangle',
        label: '패널',
        kbd: 'p',
        onSelect: () => undefined,
      },
      'polygon-panel': {
        id: 'polygon-panel',
        icon: 'geo-star',
        label: '다각형',
        kbd: 'g',
        onSelect: () => undefined,
      },
      'page-text': {
        id: 'page-text',
        icon: 'tool-text',
        label: '텍스트',
        kbd: 't',
        onSelect: () => undefined,
      },
    };
  },
};

// 기본 셸 UI(툴바/메뉴/스타일패널 등)는 자체 사이드바/툴레일로 대체하므로 모두 숨긴다.
// `hideUi` prop을 쓰면 `TldrawUiContent`가 통째로 마운트되지 않아 `useKeyboardShortcuts`도
// 비활성되므로(=Backspace 삭제, Cmd+Z 등 전부 안 됨), 대신 각 슬롯을 null로 비워 UI 만 숨긴다.
const components: TLComponents = {
  InFrontOfTheCanvas: () => <PolygonPreview />,
  ContextMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  ZoomMenu: null,
  MainMenu: null,
  Minimap: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  Toolbar: null,
  RichTextToolbar: null,
  ImageToolbar: null,
  VideoToolbar: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
  CursorChatBubble: null,
  Dialogs: null,
  Toasts: null,
  A11y: null,
};

interface Props {
  onMount: (editor: Editor) => void;
}

export function ComicEditor({ onMount }: Props) {
  const mount = useCallback(
    (editor: Editor) => {
      // 기본 도구를 'select'로
      editor.setCurrentTool('select');
      // 그리드 보기를 기본 ON. 페이지 프레임 안에 패널을 정렬할 때 유용.
      editor.updateInstanceState({ isGridMode: true });
      // 말풍선과 자유 텍스트는 항상 패널 위에. user-sourced shape 변경 때 모두 맨 위로.
      // 텍스트는 말풍선 위에 오도록 마지막에 올린다 (호출 순서 = z-order 끝).
      const bubbleIds = new Set<TLShapeId>();
      const textIds = new Set<TLShapeId>();
      for (const s of editor.getCurrentPageShapes()) {
        if (s.type === 'speech-bubble') bubbleIds.add(s.id);
        else if (s.type === 'page-text') textIds.add(s.id);
      }
      let scheduled = false;
      const unsubscribe = editor.store.listen(
        (entry) => {
          let touched = false;
          for (const r of Object.values(entry.changes.added)) {
            if (r.typeName !== 'shape') continue;
            touched = true;
            if (r.type === 'speech-bubble') bubbleIds.add(r.id);
            else if (r.type === 'page-text') textIds.add(r.id);
          }
          for (const [, after] of Object.values(entry.changes.updated)) {
            if (after.typeName === 'shape') touched = true;
          }
          for (const r of Object.values(entry.changes.removed)) {
            if (r.typeName !== 'shape') continue;
            if (r.type === 'speech-bubble') bubbleIds.delete(r.id);
            else if (r.type === 'page-text') textIds.delete(r.id);
          }
          if (!touched || (bubbleIds.size === 0 && textIds.size === 0) || scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            editor.store.mergeRemoteChanges(() => {
              if (bubbleIds.size > 0) editor.bringToFront([...bubbleIds]);
              if (textIds.size > 0) editor.bringToFront([...textIds]);
            });
          });
        },
        { source: 'user', scope: 'document' },
      );
      onMount(editor);
      return unsubscribe;
    },
    [onMount],
  );

  return (
    <Tldraw
      shapeUtils={shapeUtils}
      tools={tools}
      overrides={uiOverrides}
      components={components}
      onMount={mount}
    />
  );
}
