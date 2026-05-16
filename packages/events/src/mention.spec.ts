import { describe, it, expect } from 'vitest';
import type { TipTapDoc } from '@comicai/types';
import { resolveMentionIds, serializeTextWithNameReplacement } from './mention';

const doc: TipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '주인공 ' },
        { type: 'mention', attrs: { id: 'char_1', label: '소희', version: 3 } },
        { type: 'text', text: '와 ' },
        { type: 'mention', attrs: { id: 'bg_1', label: '카페', version: 1, deleted: true } },
        { type: 'text', text: '에서' },
      ],
    },
  ],
};

describe('resolveMentionIds', () => {
  it('returns mention ids in document order, deduped', () => {
    expect(resolveMentionIds(doc)).toEqual(['char_1', 'bg_1']);
  });

  it('handles empty doc', () => {
    const empty: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(resolveMentionIds(empty)).toEqual([]);
  });
});

describe('serializeTextWithNameReplacement', () => {
  it('replaces mentions with latest name from map', () => {
    const out = serializeTextWithNameReplacement(
      doc,
      new Map([
        ['char_1', '소희_v3'],
        ['bg_1', '카페'],
      ]),
    );
    expect(out).toContain('소희_v3');
    // deleted mention should render [삭제됨]
    expect(out).toContain('[삭제됨]');
  });

  it('falls back to label when id missing from map and not marked deleted', () => {
    const doc2: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { id: 'gone', label: '폴백라벨', version: 1 } }],
        },
      ],
    };
    expect(serializeTextWithNameReplacement(doc2, new Map())).toBe('폴백라벨');
  });
});
