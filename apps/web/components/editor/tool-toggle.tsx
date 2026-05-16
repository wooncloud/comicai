'use client';
import { useEffect } from 'react';
import { useValue, type Editor } from 'tldraw';
import { MousePointer2, Pencil, Square, Type, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Tool {
  id: string;
  kbd: string;
  label: string;
  icon: LucideIcon;
}

const TOOLS: readonly Tool[] = [
  { id: 'select', kbd: 'v', label: '선택', icon: MousePointer2 },
  { id: 'comic-panel', kbd: 'p', label: '패널', icon: Square },
  { id: 'draw', kbd: 'd', label: '콘티', icon: Pencil },
  { id: 'text', kbd: 't', label: '텍스트', icon: Type },
] as const;

const KBD_MAP: Record<string, string> = Object.fromEntries(TOOLS.map((t) => [t.kbd, t.id]));

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
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = current === t.id;
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
  );
}
