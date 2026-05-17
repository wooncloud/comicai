'use client';
import { useEffect } from 'react';
import { useValue, type Editor } from 'tldraw';
import { MousePointer2, Square, Star, Type, type LucideIcon } from 'lucide-react';
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
  { id: 'comic-panel', kbd: 'p', label: '패널', icon: Square, aliases: ['polygon-panel'] },
  { id: 'text', kbd: 't', label: '텍스트', icon: Type },
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

// 'p'는 TOOLS와 PANEL_SUB_MODES 양쪽에 있는데 sub-mode가 뒤에 spread되어 win.
// 둘 다 사각형 패널 도구를 가리켜 동작 동일 — 의도된 중복.
const KBD_MAP: Record<string, string> = {
  ...Object.fromEntries(TOOLS.map((t) => [t.kbd, t.id])),
  ...Object.fromEntries(PANEL_SUB_MODES.map((s) => [s.kbd, s.id])),
};

interface Props {
  editor: Editor | null;
}

export function ToolToggle({ editor }: Props) {
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

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = current === t.id || (t.aliases?.includes(current) ?? false);
          return (
            <button
              key={t.id}
              title={`${t.label} (${t.kbd.toUpperCase()})`}
              onClick={() => editor?.setCurrentTool(t.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded px-2 text-caption font-medium transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {(current === 'comic-panel' || current === 'polygon-panel') && (
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          {PANEL_SUB_MODES.map((m) => {
            const Icon = m.icon;
            const active = current === m.id;
            return (
              <button
                key={m.id}
                title={`${m.label} (${m.kbd.toUpperCase()})`}
                onClick={() => editor?.setCurrentTool(m.id)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded px-2 text-caption font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
