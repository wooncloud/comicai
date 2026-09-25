import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * 비어 있을 때 첫 문단에 안내 문구를 비추는 tiptap 확장.
 *
 * **왜 직접 만드나.** `@tiptap/extension-placeholder` 를 하나 더 받을 만한 일이
 * 아니다 — 하는 일은 빈 문단에 클래스와 `data-placeholder` 를 붙이는 것뿐이고,
 * 그리는 것은 어차피 CSS(`globals.css` 의 `.tiptap-placeholder`)다.
 *
 * `:empty` 로는 안 된다. ProseMirror 의 빈 문단에는 커서를 세우려고 넣는
 * `<br>` 가 들어 있어서 CSS 는 그 문단을 비었다고 보지 않는다.
 */
export const Placeholder = Extension.create<{ text: string }>({
  name: 'comicPlaceholder',

  addOptions() {
    return { text: '' };
  },

  addProseMirrorPlugins() {
    const { text } = this.options;
    return [
      new Plugin({
        key: new PluginKey('comicPlaceholder'),
        props: {
          decorations: ({ doc }) => {
            // 문단 하나뿐이고 그 안이 비었을 때만. 두 줄을 쓰다 지워 한 줄이
            // 남은 상태에도 떠야 하므로 `doc.textContent` 가 아니라 구조로 본다.
            if (doc.childCount !== 1) return null;
            const first = doc.firstChild;
            if (!first || first.content.size > 0) return null;
            return DecorationSet.create(doc, [
              Decoration.node(0, first.nodeSize, {
                class: 'tiptap-placeholder',
                'data-placeholder': text,
              }),
            ]);
          },
        },
      }),
    ];
  },
});
