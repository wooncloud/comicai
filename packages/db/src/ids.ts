import type { EntityType } from '@comicai/types';

import { ulid } from 'ulid';

export type IdPrefix =
  | 'user'
  | 'apikey'
  | 'proj'
  | 'page'
  | 'panel'
  | 'render'
  | 'char'
  | 'bg'
  | 'style'
  | 'world'
  | 'evf'
  | 'prt'
  | 'bubble'
  | 'ptext'
  | 'pline';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

/**
 * 일관성 엔티티 타입 → id 접두.
 *
 * `type` 을 손으로 다시 적으면 `EntityType` 이 늘었을 때 여기만 조용히 옛 목록을 받는다.
 * `@comicai/types` 에서 받아 두면 그때 **switch 가 비exhaustive 로 컴파일 에러**가 난다.
 */
export function entityIdPrefix(type: EntityType): IdPrefix {
  switch (type) {
    case 'style':
      return 'style';
    case 'character':
      return 'char';
    case 'background':
      return 'bg';
    case 'worldview':
      return 'world';
  }
}
