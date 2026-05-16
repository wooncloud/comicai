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
  | 'world';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

export function entityIdPrefix(type: 'style' | 'character' | 'background' | 'worldview'): IdPrefix {
  switch (type) {
    case 'style': return 'style';
    case 'character': return 'char';
    case 'background': return 'bg';
    case 'worldview': return 'world';
  }
}
