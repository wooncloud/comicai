'use client';
import { useCallback } from 'react';
import {
  Tldraw,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
  DefaultMainMenu,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { ComicPanelShapeUtil } from './comic-panel-shape';
import { ComicPanelTool } from './comic-panel-tool';
import { PageFrameShapeUtil } from './page-frame-shape';

const shapeUtils = [ComicPanelShapeUtil, PageFrameShapeUtil];
const tools = [ComicPanelTool];

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
    };
  },
};

const components: TLComponents = {
  // 최소 셸: 메뉴는 유지하되 페이지/공유 등은 숨김(MVP).
  PageMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  NavigationPanel: null,
  MainMenu: () => <DefaultMainMenu />,
};

interface Props {
  onMount: (editor: Editor) => void;
}

export function ComicEditor({ onMount }: Props) {
  const mount = useCallback(
    (editor: Editor) => {
      // 마우스 휠 zoom의 ergonomy: 트랙패드에선 pinch만으로 zoom (default ok).
      // 기본 도구를 'select'로
      editor.setCurrentTool('select');
      onMount(editor);
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
