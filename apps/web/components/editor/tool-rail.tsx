'use client';
import { useEffect } from 'react';
import { useValue, type Editor } from 'tldraw';
import { KBD_TO_TOOL, TOOL_GROUPS, type ToolDef } from './tldraw/tool-registry';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

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
      const next = KBD_TO_TOOL[e.code];
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

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <nav className="flex w-12 flex-none flex-col items-center gap-1 border-r border-border bg-card py-2">
        {TOOL_GROUPS.map(({ primary: t, subModes }) => {
          const Icon = t.icon;
          // 하위 모드가 켜져 있어도 1차 도구는 활성으로 보여야 한다.
          const active = current === t.id || (subModes?.some((m) => m.id === current) ?? false);
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

        {TOOL_GROUPS.map(({ primary, subModes }) =>
          subModes && (current === primary.id || subModes.some((m) => m.id === current)) ? (
            <SubModeGroup key={primary.id} modes={subModes} current={current} editor={editor} />
          ) : null,
        )}
      </nav>
    </TooltipProvider>
  );
}

function SubModeGroup({
  modes,
  current,
  editor,
}: {
  modes: readonly ToolDef[];
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
