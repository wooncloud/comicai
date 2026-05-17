'use client';
import { useEffect } from 'react';
import { useValue, type Editor } from 'tldraw';
import {
  Hand,
  MessageCircle,
  MousePointer2,
  Square,
  Star,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface Tool {
  id: string;
  kbd: string;
  label: string;
  icon: LucideIcon;
  /** 활성 표시 시 함께 켜진 것으로 간주할 동기 도구들(예: 패널의 다각형 sub-mode). */
  aliases?: readonly string[];
  /** true면 disabled — 자리만 표시(예: 말풍선은 추후 구현). */
  disabled?: boolean;
}

const TOOLS: readonly Tool[] = [
  { id: 'select', kbd: 'v', label: '선택', icon: MousePointer2 },
  { id: 'hand', kbd: 'h', label: '손', icon: Hand },
  { id: 'comic-panel', kbd: 'p', label: '패널', icon: Square, aliases: ['polygon-panel'] },
  { id: 'text', kbd: 't', label: '텍스트', icon: Type },
  { id: 'speech-bubble', kbd: 'b', label: '말풍선', icon: MessageCircle, disabled: true },
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

const KBD_MAP: Record<string, string> = {
  ...Object.fromEntries(TOOLS.filter((t) => !t.disabled).map((t) => [t.kbd, t.id])),
  ...Object.fromEntries(PANEL_SUB_MODES.map((s) => [s.kbd, s.id])),
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const next = KBD_MAP[e.key.toLowerCase()];
      if (next) {
        e.preventDefault();
        editor.setCurrentTool(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  const panelActive = current === 'comic-panel' || current === 'polygon-panel';

  return (
    <nav className="flex w-12 flex-none flex-col items-center gap-1 border-r border-border bg-card py-2">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = !t.disabled && (current === t.id || (t.aliases?.includes(current) ?? false));
        return (
          <button
            key={t.id}
            type="button"
            title={t.disabled ? `${t.label} (준비 중)` : `${t.label} (${t.kbd.toUpperCase()})`}
            disabled={t.disabled}
            onClick={() => !t.disabled && editor?.setCurrentTool(t.id)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              t.disabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{t.label}</span>
          </button>
        );
      })}

      {panelActive && (
        <div className="mt-1 flex flex-col items-center gap-1 border-t border-border pt-1">
          {PANEL_SUB_MODES.map((m) => {
            const Icon = m.icon;
            const active = current === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={`${m.label} (${m.kbd.toUpperCase()})`}
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
            );
          })}
        </div>
      )}
    </nav>
  );
}
