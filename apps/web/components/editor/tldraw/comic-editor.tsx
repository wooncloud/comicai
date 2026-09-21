'use client';
import { useCallback, useMemo, useRef } from 'react';
import { Tldraw, sortByIndex, type Editor, type TLComponents, type TLUiOverrides } from 'tldraw';
import 'tldraw/tldraw.css';
import type { LayerOrderAction } from '@/lib/use-layer-reorder';
import { ComicPanelShapeUtil } from './comic-panel-shape';
import { ALL_TOOLS } from './tool-registry';
import { ComicPanelTool } from './comic-panel-tool';
import { PageFrameShapeUtil } from './page-frame-shape';
import { PolygonPanelTool } from './polygon-panel-tool';
import { PolygonPreview } from './polygon-preview';
import { SpeechBubbleShapeUtil } from './speech-bubble-shape';
import { ALL_BUBBLE_TOOLS } from './speech-bubble-tools';
import { PageTextShapeUtil } from './page-text-shape';
import { PageTextTool } from './page-text-tool';
import { PageLineShapeUtil } from './page-line-shape';
import { PageLineTool } from './page-line-tool';

const shapeUtils = [
  ComicPanelShapeUtil,
  PageFrameShapeUtil,
  SpeechBubbleShapeUtil,
  PageTextShapeUtil,
  PageLineShapeUtil,
];
const tools = [ComicPanelTool, PolygonPanelTool, PageTextTool, PageLineTool, ...ALL_BUBBLE_TOOLS];

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
  onReorderAction?: (action: LayerOrderAction) => boolean;
}

export function ComicEditor({ onMount, onReorderAction }: Props) {
  const onReorderRef = useRef(onReorderAction);
  onReorderRef.current = onReorderAction;

  /**
   * tldraw 에게 우리 도구를 알려 주고 단축키 순서 변경 액션을 가로챈다.
   * 말풍선·텍스트·직선은 단축키(], alt+], alt+[, [)로 순서를 바꿀 때도
   * 인스펙터와 동일한 reorder API 경로를 타도록 actions 를 오버라이드한다.
   */
  const uiOverrides = useMemo<TLUiOverrides>(
    () => ({
      tools(_editor, baseTools) {
        const ours = Object.fromEntries(
          ALL_TOOLS.filter((t) => t.tldrawIcon).map((t) => [
            t.id,
            {
              id: t.id,
              icon: t.tldrawIcon!,
              label: t.label,
              kbd: t.kbd,
              onSelect: () => undefined,
            },
          ]),
        );
        return { ...baseTools, ...ours };
      },
      actions(editor, baseActions) {
        const next = { ...baseActions };
        const override = (id: string, actionKey: LayerOrderAction) => {
          const base = next[id];
          if (base) {
            next[id] = {
              ...base,
              onSelect(source) {
                // 컷(comic-panel)은 항상 최하위 층을 유지해야 하며 별도의 순서 저장 API 가 없다.
                // 컷이 선택된 상태에서 tldraw 기본 Reorder 액션(base.onSelect)이 실행되면
                // 컷이 말풍선·텍스트 위로 올라가 층 계층이 깨지므로 아무 동작도 하지 않는다.
                const selected = editor.getSelectedShapes();
                if (selected.some((s) => s.type === 'comic-panel')) {
                  return;
                }
                if (onReorderRef.current?.(actionKey)) return;
                void base.onSelect(source);
              },
            };
          }
        };
        override('bring-to-front', 'toFront');
        override('bring-forward', 'forward');
        override('send-backward', 'backward');
        override('send-to-back', 'toBack');
        return next;
      },
    }),
    [],
  );

  const mount = useCallback(
    (editor: Editor) => {
      // 기본 도구를 'select'로
      editor.setCurrentTool('select');
      // 그리드 보기를 기본 ON. 페이지 프레임 안에 패널을 정렬할 때 유용.
      editor.updateInstanceState({ isGridMode: true });
      const unsubscribe = setupLayerEnforcement(editor);
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

/**
 * 말풍선·자유 텍스트·자유 직선은 항상 패널 위에 오도록 계층을 강제한다.
 * 계층 순서: 컷(comic-panel) < 말풍선(speech-bubble) < 텍스트(page-text) < 직선(page-line).
 *
 * 사용자가 도형을 추가했거나 도형의 index 가 변경된 경우에만 queueMicrotask 로
 * 말풍선 → 텍스트 → 직선 순으로 bringToFront 를 호출하여 계층을 복원한다.
 * 드래그(x, y 이동) 등 index 가 바뀌지 않는 일반 편집에서는 bringToFront 를 부르지 않는다.
 */
export function setupLayerEnforcement(
  editor: Pick<Editor, 'store' | 'getCurrentPageShapes' | 'bringToFront'>,
): () => void {
  let scheduled = false;
  return editor.store.listen(
    (entry) => {
      let shouldEnforce = false;

      // 1. 도형이 새로 추가되었는지 확인
      for (const r of Object.values(entry.changes.added)) {
        if (r.typeName === 'shape') {
          shouldEnforce = true;
          break;
        }
      }

      // 2. 어떤 도형의 index 가 변경되었는지 확인
      if (!shouldEnforce) {
        for (const [before, after] of Object.values(entry.changes.updated)) {
          if (
            before.typeName === 'shape' &&
            after.typeName === 'shape' &&
            before.index !== after.index
          ) {
            shouldEnforce = true;
            break;
          }
        }
      }

      if (!shouldEnforce || scheduled) return;

      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        // 페이지의 모든 도형을 조회하여 서버에서 역방향 투영된 도형도 모두 포함한다.
        const shapes = editor.getCurrentPageShapes();
        const bubbles = shapes.filter((s) => s.type === 'speech-bubble').sort(sortByIndex);
        const texts = shapes.filter((s) => s.type === 'page-text').sort(sortByIndex);
        const lines = shapes.filter((s) => s.type === 'page-line').sort(sortByIndex);

        if (bubbles.length === 0 && texts.length === 0 && lines.length === 0) return;

        editor.store.mergeRemoteChanges(() => {
          if (bubbles.length > 0) editor.bringToFront(bubbles.map((s) => s.id));
          if (texts.length > 0) editor.bringToFront(texts.map((s) => s.id));
          if (lines.length > 0) editor.bringToFront(lines.map((s) => s.id));
        });
      });
    },
    { source: 'user', scope: 'document' },
  );
}
