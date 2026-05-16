'use client';
import { useEffect, useState } from 'react';
import type { Editor } from 'tldraw';
import { cn } from '@/lib/cn';

const TOOLS = [
  { id: 'select', label: 'V', title: '선택 (V)' },
  { id: 'comic-panel', label: 'P', title: '패널 (P)' },
  { id: 'draw', label: 'D', title: '콘티 / 자유선 (D)' },
  { id: 'text', label: 'T', title: '텍스트 (T)' },
] as const;

interface Props {
  editor: Editor | null;
}

export function ToolToggle({ editor }: Props) {
  const [current, setCurrent] = useState('select');

  useEffect(() => {
    if (!editor) return;
    const unsub = editor.store.listen(
      () => {
        setCurrent(editor.getCurrentToolId());
      },
      { source: 'user' },
    );
    setCurrent(editor.getCurrentToolId());
    return () => unsub();
  }, [editor]);

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
      const map: Record<string, string> = {
        v: 'select',
        p: 'comic-panel',
        d: 'draw',
        t: 'text',
      };
      const next = map[e.key.toLowerCase()];
      if (next) {
        e.preventDefault();
        editor.setCurrentTool(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.title}
          onClick={() => editor?.setCurrentTool(t.id)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded text-caption font-medium transition-colors',
            current === t.id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
