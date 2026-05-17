'use client';
import { useCallback } from 'react';
import { Tldraw, type Editor, type TLComponents, type TLUiOverrides } from 'tldraw';
import 'tldraw/tldraw.css';
import { ComicPanelShapeUtil } from './comic-panel-shape';
import { ComicPanelTool } from './comic-panel-tool';
import { PageFrameShapeUtil } from './page-frame-shape';
import { PolygonPanelTool } from './polygon-panel-tool';
import { PolygonPreview } from './polygon-preview';

const shapeUtils = [ComicPanelShapeUtil, PageFrameShapeUtil];
const tools = [ComicPanelTool, PolygonPanelTool];

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
