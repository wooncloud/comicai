'use client';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { ApiPaths, type ConsistencyEntityDTO } from '@comicai/types';
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

/** 팝업이 열려 있는 동안 tiptap 이 키 입력을 넘겨줄 창구. */
interface MentionListHandle {
  onKeyDown: (p: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListHandle, ListProps>(
  function MentionList(props, ref) {
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
          </button>
        ))}
      </div>
    );
  },
);

export function createMentionSuggestion(
  projectId: string,
): Omit<SuggestionOptions<MentionItem>, 'editor'> {
  return {
    char: '@',
    items: async ({ query }) => {
      try {
        const list = await api<ConsistencyEntityDTO[]>(ApiPaths.projectConsistency(projectId));
        const lower = query.toLowerCase();
        // 그림체(style)는 @멘션이 아니라 패널 인스펙터의 select로 주입되므로 후보에서 제외.
        const filtered = list.filter((e) => {
          if (e.type === 'style') return false;
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
      /**
       * 마운트된 팝업 하나. 엘리먼트·root·ref 를 한 덩어리로 들고 있는다.
       * 예전처럼 `popup` 과 `component` 를 따로 두면 "엘리먼트는 body 에 붙었는데
       * 지울 핸들은 아직 없는" 중간 상태가 생기고, 아래 취소 경합이 정확히 그 틈으로 샜다.
       */
      interface Mounted {
        update: (props: ListProps) => void;
        place: (rect: DOMRect | null) => void;
        destroy: () => void;
        ref: { current: MentionListHandle | null };
      }
      let mounted: Mounted | null = null;

      /*
       * onStart 는 `react-dom/client` 를 동적 import 하는 동안 쉰다. 그 사이에 사용자가
       * mention 을 취소하면 onExit 이 **마운트 전에** 도착하는데, 그때는 지울 것이 아직
       * 없어서 아무 일도 일어나지 않는다. 그 뒤 깨어난 본체가 팝업을 body 에 붙이면 그
       * 참조는 이 클로저 밖으로 나가지 않으므로 **아무도 지울 수 없는 팝업이 DOM 에
       * 영구히 남는다.**
       *
       * 그래서 세션마다 토큰을 만들고, 깨어난 본체는 자기 토큰이 아직 현재인지 본다.
       * 불리언 하나로는 "취소한 뒤 곧바로 다시 @ 입력" 을 구분하지 못한다 — 두 번째
       * onStart 가 플래그를 다시 켜 버려서 첫 번째 본체까지 마운트되고, 그게 그대로 샌다.
       */
      let session: object | null = null;

      /** 마운트 전에 도착한 마지막 상태. 버리면 첫 타이핑 결과가 화면에 안 나온다. */
      let pending: { props: ListProps; rect: DOMRect | null } | null = null;

      const snapshot = (props: SuggestionProps<MentionItem>) => ({
        props: { items: props.items, command: (item: MentionItem) => props.command(item) },
        rect: props.clientRect?.() ?? null,
      });

      return {
        onStart: (props) => {
          const token = {};
          session = token;
          pending = null;
          void (async () => {
            const { createRoot } = await import('react-dom/client');
            const { default: React } = await import('react');
            if (session !== token) return;

            const el = document.createElement('div');
            el.style.position = 'absolute';
            el.style.zIndex = '50';
            document.body.appendChild(el);
            const root = createRoot(el);
            const ref: Mounted['ref'] = { current: null };
            const m: Mounted = {
              update: (p) =>
                root.render(React.createElement(MentionList as never, { ...p, ref } as never)),
              place: (rect) => {
                if (!rect) return;
                el.style.left = `${rect.left}px`;
                el.style.top = `${rect.bottom + 4}px`;
              },
              destroy: () => {
                root.unmount();
                el.remove();
              },
              ref,
            };
            mounted = m;
            // 기다리는 동안 온 타이핑·이동을 여기서 따라잡는다. 없었으면 onStart 의 값.
            const initial = pending ?? snapshot(props);
            m.update(initial.props);
            m.place(initial.rect);
            pending = null;
          })();
        },
        onUpdate: (props) => {
          const next = snapshot(props);
          // 아직 마운트 전이면 들고 있다가 위에서 반영한다.
          if (!mounted) {
            pending = next;
            return;
          }
          mounted.update(next.props);
          mounted.place(next.rect);
        },
        onKeyDown: (props) => mounted?.ref.current?.onKeyDown({ event: props.event }) ?? false,
        onExit: () => {
          // 토큰을 버리는 것이 아직 안 깨어난 본체를 막는 유일한 수단이다.
          session = null;
          pending = null;
          mounted?.destroy();
          mounted = null;
        },
      };
    },
  };
}
