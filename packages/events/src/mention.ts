import type { TipTapDoc, TipTapNode } from '@comicai/types';

/** 본문에 등장하는 멘션 노드의 entity id 집합(순서 유지, 중복 제거). */
export function resolveMentionIds(doc: TipTapDoc): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  walk(doc, (n) => {
    if (n.type === 'mention' && !seen.has(n.attrs.id)) {
      seen.add(n.attrs.id);
      ids.push(n.attrs.id);
    }
  });
  return ids;
}

/**
 * 본문을 텍스트로 직렬화하며 멘션 노드를 해당 엔티티의 name으로 치환.
 * 삭제된(멘션 endpoint가 사라진) 노드는 [삭제됨] 으로 마킹한다.
 */
export function serializeTextWithNameReplacement(
  doc: TipTapDoc,
  nameById: Map<string, string>,
): string {
  const out: string[] = [];
  walk(doc, (n) => {
    if (n.type === 'text') out.push(n.text);
    else if (n.type === 'mention') {
      if (n.attrs.deleted) out.push('[삭제됨]');
      else out.push(nameById.get(n.attrs.id) ?? n.attrs.label);
    } else if (n.type === 'hardBreak') out.push('\n');
    else if (n.type === 'paragraph') out.push('\n');
  });
  return out.join('').replace(/\n+/g, '\n').trim();
}

function walk(node: TipTapNode, visit: (n: TipTapNode) => void) {
  visit(node);
  const content = (node as { content?: TipTapNode[] }).content;
  if (Array.isArray(content)) for (const c of content) walk(c, visit);
}
