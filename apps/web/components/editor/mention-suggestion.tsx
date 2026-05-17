'use client';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { ConsistencyEntityDTO } from '@comicai/types';
import { api } from '@/lib/api';

interface MentionItem {
  id: string;
  label: string;
  version: number;
  type: ConsistencyEntityDTO['type'];
}

const TYPE_ICON: Record<MentionItem['type'], string> = {
  style: '🎨',
  character: '👤',
  background: '🌆',
  worldview: '🌐',
};

interface ListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export const MentionList = forwardRef<unknown, ListProps>(function MentionList(props, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + props.items.length - 1) % Math.max(1, props.items.length));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(1, props.items.length));
        return true;
      }
      if (event.key === 'Enter') {
        const item = props.items[selectedIndex];
        if (item) props.command(item);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500 shadow dark:border-neutral-700 dark:bg-neutral-900">
        일치하는 항목 없음
      </div>
    );
  }
  return (
    <div className="max-h-56 w-64 overflow-auto rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      {props.items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => props.command(item)}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
            i === selectedIndex
              ? 'bg-neutral-100 dark:bg-neutral-800'
              : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
          }`}
        >
          <span className="text-base">{TYPE_ICON[item.type]}</span>
          <span className="flex-1 truncate">{item.label}</span>
          <span className="text-xs text-neutral-500">v{item.version}</span>
        </button>
      ))}
    </div>
  );
});

export function createMentionSuggestion(
  projectId: string,
): Omit<SuggestionOptions<MentionItem>, 'editor'> {
  return {
    char: '@',
    items: async ({ query }) => {
      try {
        const list = await api<ConsistencyEntityDTO[]>(`/projects/${projectId}/consistency`);
        const lower = query.toLowerCase();
        const filtered = list.filter((e) => {
          const hay = [e.name, ...e.aliases].join(' ').toLowerCase();
          return hay.includes(lower);
        });
        return filtered.slice(0, 8).map<MentionItem>((e) => ({
          id: e.id,
          label: e.name,
          version: e.version,
          type: e.type,
        }));
      } catch {
        return [];
      }
    },
    render: () => {
      let popup: HTMLDivElement | null = null;
      let component: { destroy: () => void; updateProps: (p: ListProps) => void } | null = null;
      return {
        onStart: (props) => {
          void (async () => {
            const { createRoot } = await import('react-dom/client');
            const { default: React } = await import('react');
            popup = document.createElement('div');
            popup.style.position = 'absolute';
            popup.style.zIndex = '50';
            document.body.appendChild(popup);
            const root = createRoot(popup);
            let currentProps: ListProps = {
              items: props.items,
              command: (item) => props.command(item),
            };
            const ref: { current: unknown } = { current: null };
            const render = (p: ListProps) =>
              root.render(React.createElement(MentionList as never, { ...p, ref } as never));
            render(currentProps);
            const rect = props.clientRect?.();
            if (rect) {
              popup.style.left = `${rect.left}px`;
              popup.style.top = `${rect.bottom + 4}px`;
            }
            component = {
              destroy: () => {
                root.unmount();
                popup?.remove();
                popup = null;
              },
              updateProps: (p) => {
                currentProps = p;
                render(p);
              },
            };
            (component as unknown as { ref: typeof ref }).ref = ref;
          })();
        },
        onUpdate: (props) => {
          if (!component || !popup) return;
          component.updateProps({
            items: props.items,
            command: (item) => props.command(item),
          });
          const rect = props.clientRect?.();
          if (rect) {
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          }
        },
        onKeyDown: (props) => {
          const ref = (
            component as unknown as {
              ref?: { current?: { onKeyDown: (p: { event: KeyboardEvent }) => boolean } };
            }
          )?.ref;
          return ref?.current?.onKeyDown({ event: props.event }) ?? false;
        },
        onExit: () => {
          component?.destroy();
          component = null;
        },
      };
    },
  };
}
