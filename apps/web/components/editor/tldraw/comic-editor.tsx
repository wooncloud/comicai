'use client';
import { useCallback } from 'react';
import {
  Tldraw,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
  DefaultMainMenu,
  DefaultToolbar,
  HandToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  TldrawUiMenuToolItem,
} from 'tldraw';
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

const components: TLComponents = {
  // 최소 셸: 메뉴는 유지하되 페이지/공유 등은 숨김(MVP).
  PageMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  NavigationPanel: null,
  MainMenu: () => <DefaultMainMenu />,
  InFrontOfTheCanvas: () => <PolygonPreview />,
  // 하단 툴바를 선택/손/패널/텍스트만 노출하도록 축소. 그 외 기본 도구(그리기/지우개/
  // 화살표/스티키/이미지/도형 등)는 만화 워크플로에 불필요해 숨김.
  // TODO: 말풍선 도구가 등록되면 여기에 <TldrawUiMenuToolItem toolId="speech-bubble" />
  Toolbar: () => (
    <DefaultToolbar>
      <SelectToolbarItem />
      <HandToolbarItem />
      <TldrawUiMenuToolItem toolId="comic-panel" />
      <TextToolbarItem />
    </DefaultToolbar>
  ),
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
