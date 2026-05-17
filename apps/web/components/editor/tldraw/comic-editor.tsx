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

const shapeUtils = [ComicPanelShapeUtil, PageFrameShapeUtil, SpeechBubbleShapeUtil];
const tools = [ComicPanelTool, PolygonPanelTool, ...ALL_BUBBLE_TOOLS];

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
    };
  },
};

// hideUi=true이면 기본 셸 UI(툴바/메뉴/스타일패널 등)가 전부 사라진다.
// 캔버스 안에 띄우는 PolygonPreview만 유지.
const components: TLComponents = {
  InFrontOfTheCanvas: () => <PolygonPreview />,
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
      // 말풍선은 항상 패널 위에. user-sourced shape 변경이 있을 때 모든 speech-bubble을 맨 위로.
      // 우리 mergeRemoteChanges 호출은 source='remote'로 분류되므로 source='user'로 한정해 루프 방지.
      const bubbleIds = new Set<TLShapeId>();
      for (const s of editor.getCurrentPageShapes()) {
        if (s.type === 'speech-bubble') bubbleIds.add(s.id);
      }
      let scheduled = false;
      editor.store.listen(
        (entry) => {
          let touched = false;
          for (const r of Object.values(entry.changes.added)) {
            if (r.typeName !== 'shape') continue;
            touched = true;
            if (r.type === 'speech-bubble') bubbleIds.add(r.id);
          }
          for (const [, after] of Object.values(entry.changes.updated)) {
            if (after.typeName === 'shape') touched = true;
          }
          for (const r of Object.values(entry.changes.removed)) {
            if (r.typeName === 'shape' && r.type === 'speech-bubble') bubbleIds.delete(r.id);
          }
          if (!touched || bubbleIds.size === 0 || scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            editor.store.mergeRemoteChanges(() => {
              editor.bringToFront([...bubbleIds]);
            });
          });
        },
        { source: 'user', scope: 'document' },
      );
      onMount(editor);
    },
    [onMount],
  );

  return (
    <Tldraw
      hideUi
      shapeUtils={shapeUtils}
      tools={tools}
      overrides={uiOverrides}
      components={components}
      onMount={mount}
    />
  );
}
