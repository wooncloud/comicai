import Mention from '@tiptap/extension-mention';
import type { TipTapMentionAttrs } from '@comicai/types';

/**
 * @-trigger mention. attrs: { id, label, version, deleted? }
 * 직렬화 시 그대로 JSON에 들어가고, 서버에서 resolveMentionIds로 추출된다.
 */
export const ComicMention = Mention.extend({
  addAttributes() {
    return {
      id: { default: '' },
      label: { default: '' },
      version: { default: 1 },
      deleted: { default: false },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as TipTapMentionAttrs;
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-mention-id': attrs.id,
        class:
          'inline-block rounded bg-blue-100 px-1 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      },
      `@${attrs.label}`,
    ];
  },
});
