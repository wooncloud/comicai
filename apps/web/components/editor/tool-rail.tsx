'use client';
import { useEffect } from 'react';
import { useValue, type Editor } from 'tldraw';
import {
  Circle,
  Cloud,
  Hand,
  MessageCircle,
  MousePointer2,
  Pentagon,
  Square,
  Star,
  Type,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface Tool {
  id: string;
  kbd: string;
  label: string;
  icon: LucideIcon;
  /** 활성 표시 시 함께 켜진 것으로 간주할 동기 도구들(예: 패널의 다각형 sub-mode). */
  aliases?: readonly string[];
}

const TOOLS: readonly Tool[] = [
  { id: 'select', kbd: 'v', label: '선택', icon: MousePointer2 },
  { id: 'hand', kbd: 'h', label: '손', icon: Hand },
  { id: 'comic-panel', kbd: 'p', label: '패널', icon: Square, aliases: ['polygon-panel'] },
  { id: 'text', kbd: 't', label: '텍스트', icon: Type },
  {
    id: 'bubble-ellipse',
    kbd: 'b',
    label: '말풍선',
    icon: MessageCircle,
    aliases: ['bubble-rect', 'bubble-cloud', 'bubble-spike', 'bubble-thought', 'bubble-polygon'],
  },
] as const;

interface PanelSubMode {
  id: 'comic-panel' | 'polygon-panel';
  kbd: string;
  label: string;
  icon: LucideIcon;
}

const PANEL_SUB_MODES: readonly PanelSubMode[] = [
  { id: 'comic-panel', kbd: 'p', label: '사각형', icon: Square },
  { id: 'polygon-panel', kbd: 'g', label: '다각형', icon: Star },
] as const;

interface BubbleSubMode {
  id:
    | 'bubble-ellipse'
    | 'bubble-rect'
    | 'bubble-cloud'
    | 'bubble-spike'
    | 'bubble-thought'
    | 'bubble-polygon';
  kbd: string;
  label: string;
  icon: LucideIcon;
}

const BUBBLE_SUB_MODES: readonly BubbleSubMode[] = [
  { id: 'bubble-ellipse', kbd: 'b', label: '타원', icon: Circle },
  { id: 'bubble-rect', kbd: 'r', label: '사각', icon: Square },
  { id: 'bubble-cloud', kbd: 'c', label: '구름', icon: Cloud },
  { id: 'bubble-spike', kbd: 'k', label: '스파이크', icon: Zap },
  { id: 'bubble-thought', kbd: 'o', label: '생각', icon: MessageCircle },
  { id: 'bubble-polygon', kbd: 'n', label: '다각형', icon: Pentagon },
] as const;

// 한글 IME 활성 시 `e.key` 가 'ㅂ'/'ㅎ' 같은 자모로 들어오므로 KeyboardEvent.code 기준으로 매핑.
// 'b' → 'KeyB' 등. TOOLS의 primary kbd 중 sub-mode와 겹치는 'b' 같은 키는 sub-mode 가 덮어쓰도록 뒤에 둔다.
const codeOf = (k: string) => `Key${k.toUpperCase()}`;
const KBD_MAP: Record<string, string> = {
  ...Object.fromEntries(TOOLS.map((t) => [codeOf(t.kbd), t.id])),
  ...Object.fromEntries(PANEL_SUB_MODES.map((s) => [codeOf(s.kbd), s.id])),
  ...Object.fromEntries(BUBBLE_SUB_MODES.map((s) => [codeOf(s.kbd), s.id])),
};

interface Props {
  editor: Editor | null;
}

export function ToolRail({ editor }: Props) {
  const current = useValue('current-tool', () => editor?.getCurrentToolId() ?? 'select', [editor]);

  useEffect(() => {
    if (!editor) return;
    function onKey(e: KeyboardEvent) {
      if (!editor) return;
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const next = KBD_MAP[e.code];
      if (!next) return;
      // tldraw 기본 단축키('r'=rectangle, 'o'=ellipse 등)와 키가 겹치므로 capture + stopImmediate
      // 로 우선권 잡고 tldraw 핸들러에는 도달하지 않게 한다.
      e.preventDefault();
      e.stopImmediatePropagation();
      editor.setCurrentTool(next);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editor]);

  const panelActive = current === 'comic-panel' || current === 'polygon-panel';
  const bubbleActive = BUBBLE_SUB_MODES.some((m) => m.id === current);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <nav className="flex w-12 flex-none flex-col items-center gap-1 border-r border-border bg-card py-2">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = current === t.id || (t.aliases?.includes(current) ?? false);
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => editor?.setCurrentTool(t.id)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="sr-only">{t.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t.label}
                <span className="ml-1 opacity-60">{t.kbd.toUpperCase()}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {panelActive && <SubModeGroup modes={PANEL_SUB_MODES} current={current} editor={editor} />}
        {bubbleActive && (
          <SubModeGroup modes={BUBBLE_SUB_MODES} current={current} editor={editor} />
        )}
      </nav>
    </TooltipProvider>
  );
}

interface SubMode {
  id: string;
  kbd: string;
  label: string;
  icon: LucideIcon;
}

function SubModeGroup({
  modes,
  current,
  editor,
}: {
  modes: readonly SubMode[];
  current: string;
  editor: Editor | null;
}) {
  return (
    <div className="mt-1 flex flex-col items-center gap-1 border-t border-border pt-1">
      {modes.map((m) => {
        const Icon = m.icon;
        const active = current === m.id;
        return (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => editor?.setCurrentTool(m.id)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="sr-only">{m.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {m.label}
              <span className="ml-1 opacity-60">{m.kbd.toUpperCase()}</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
