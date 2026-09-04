import {
  Circle,
  Hand,
  MessageCircle,
  MousePointer2,
  Pentagon,
  Slash,
  Square,
  Star,
  Type,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * 캔버스 도구의 단일 출처.
 *
 * 예전에는 같은 정보가 두 곳에 있었다 — `comic-editor.tsx` 의 `uiOverrides.tools`
 * (tldraw 에게 알려 주는 id·단축키)와 `tool-rail.tsx` 의 `TOOLS`/`PANEL_SUB_MODES`/
 * `BUBBLE_SUB_MODES`(화면에 그리는 목록). **이미 갈라져 있었다**: 말풍선 4종(b/r/k/n)이
 * 툴레일에만 있고 `uiOverrides` 에는 없었다.
 *
 * 한쪽만 고치면 아무 에러 없이 단축키가 안 먹거나 tldraw 기본 단축키('r'=rectangle 등)에
 * 가로채인다. 도구를 하나 더 붙일 때 고칠 곳을 하나로 만든다.
 *
 * **이 파일은 tldraw 를 import 하지 않는다.** `tool-rail` 이 이걸 쓰는데, 여기서 tldraw
 * 값을 하나라도 가져오면 정적 import 사슬이 tldraw 번들 전체를 초기 로드로 끌어온다
 * (`shape-id.ts` 의 주석 참조).
 */
export interface ToolDef {
  id: string;
  /** 단축키. 한글 IME 를 고려해 `KeyboardEvent.code` 로 매핑된다. */
  kbd: string;
  label: string;
  icon: LucideIcon;
  /**
   * tldraw `uiOverrides` 에 등록할 때 쓰는 아이콘 이름.
   * 없으면 tldraw 기본 도구라 등록하지 않는다(select·hand).
   */
  tldrawIcon?: string;
}

/** 툴레일에 보이는 1차 도구와, 그 도구를 고르면 펼쳐지는 하위 모드. 배열 순서 = 표시 순서. */
export interface ToolGroup {
  primary: ToolDef;
  subModes?: readonly ToolDef[];
}

const PANEL_SUB_MODES = [
  { id: 'comic-panel', kbd: 'p', label: '사각형', icon: Square, tldrawIcon: 'geo-rectangle' },
  { id: 'polygon-panel', kbd: 'g', label: '다각형', icon: Star, tldrawIcon: 'geo-star' },
] as const satisfies readonly ToolDef[];

const BUBBLE_SUB_MODES = [
  { id: 'bubble-ellipse', kbd: 'b', label: '타원', icon: Circle, tldrawIcon: 'geo-ellipse' },
  { id: 'bubble-rect', kbd: 'r', label: '사각', icon: Square, tldrawIcon: 'geo-rectangle' },
  { id: 'bubble-spike', kbd: 'k', label: '뾰족', icon: Zap, tldrawIcon: 'geo-star' },
  { id: 'bubble-polygon', kbd: 'n', label: '다각형', icon: Pentagon, tldrawIcon: 'geo-hexagon' },
] as const satisfies readonly ToolDef[];

export const TOOL_GROUPS: readonly ToolGroup[] = [
  { primary: { id: 'select', kbd: 'v', label: '선택', icon: MousePointer2 } },
  { primary: { id: 'hand', kbd: 'h', label: '손', icon: Hand } },
  {
    primary: {
      id: 'comic-panel',
      kbd: 'p',
      label: '컷',
      icon: Square,
      tldrawIcon: 'geo-rectangle',
    },
    subModes: PANEL_SUB_MODES,
  },
  { primary: { id: 'page-text', kbd: 't', label: '텍스트', icon: Type, tldrawIcon: 'tool-text' } },
  { primary: { id: 'page-line', kbd: 'l', label: '직선', icon: Slash, tldrawIcon: 'tool-line' } },
  {
    primary: {
      id: 'bubble-ellipse',
      kbd: 'b',
      label: '말풍선',
      icon: MessageCircle,
      tldrawIcon: 'geo-ellipse',
    },
    subModes: BUBBLE_SUB_MODES,
  },
];

/** 하위 모드까지 펼친 전체 도구. */
export const ALL_TOOLS: readonly ToolDef[] = TOOL_GROUPS.flatMap((g) => [
  g.primary,
  ...(g.subModes ?? []),
]);

/**
 * `KeyboardEvent.code` → 도구 id.
 *
 * `e.key` 가 아니라 `code` 인 이유: 한글 IME 가 켜져 있으면 `e.key` 가 'ㅂ'/'ㅎ' 같은
 * 자모로 들어온다. 하위 모드를 뒤에 넣어, 1차 도구와 키가 겹치는 'b' 같은 경우
 * 하위 모드가 이긴다(말풍선 'b' → bubble-ellipse).
 */
export const KBD_TO_TOOL: Readonly<Record<string, string>> = Object.fromEntries([
  ...TOOL_GROUPS.map((g) => [`Key${g.primary.kbd.toUpperCase()}`, g.primary.id]),
  ...TOOL_GROUPS.flatMap((g) => (g.subModes ?? []).map((m) => [`Key${m.kbd.toUpperCase()}`, m.id])),
]);
