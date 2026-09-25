import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPageTextStyle, defaultSpeechBubbleStyle } from '@comicai/types';

/** vitest 는 apps/web 에서 돈다. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const DIR = 'components/editor/tldraw/';
const TOOLS = [
  'page-text-tool.tsx',
  'speech-bubble-tools.tsx',
  'page-line-tool.tsx',
  'box-tool.ts',
];
const BOX_TOOL = read(`${DIR}box-tool.ts`);

/**
 * 도구가 만드는 도형의 기본값은 **셰이프의 `getDefaultProps()` 한 곳**에서만 온다.
 * tldraw 가 만들 때 `{ ...getDefaultProps(), ...partial.props }` 로 채운다.
 *
 * 2026-09-25: 도구가 fontSize/색/정렬을 직접 박아 둬서, 공용 기본값을 가운데 정렬로
 * 바꿔도 **새로 만든 텍스트만 왼쪽 정렬로 태어났다.** 그 뒤에도 도구마다 기본값 함수가
 * 남아 있어 출처가 둘이었다. 값이 한 곳에만 있는지는 소스로만 지킬 수 있어 여기서 본다.
 */
describe('도구는 기본값을 다시 적지 않는다', () => {
  it('도구 파일에 기본 스타일 함수도, 박아 둔 값도 없다', () => {
    for (const file of TOOLS) {
      const src = read(DIR + file);
      for (const banned of [
        'defaultPageTextStyle',
        'defaultSpeechBubbleStyle',
        'defaultPageLineStyle',
        "textAlign: '",
        "strokeColor: '#",
        "fillColor: '#",
      ]) {
        expect(src, `${file}: ${banned}`).not.toContain(banned);
      }
    }
  });

  it('셰이프의 기본값은 packages/types 를 본다', () => {
    expect(read(`${DIR}page-text-shape.tsx`)).toContain('...defaultPageTextStyle()');
    expect(read(`${DIR}speech-bubble-shape.tsx`)).toContain('...defaultSpeechBubbleStyle()');
  });

  it('공용 기본값 자체는 이 모양이다', () => {
    expect(defaultPageTextStyle().textAlign).toBe('center');
    expect(defaultSpeechBubbleStyle().fillColor).toBe('#ffffff');
  });
});

describe('만들자마자 칠 수 있다', () => {
  it('클릭 생성 직후 편집을 연다', () => {
    const up = BOX_TOOL.slice(BOX_TOOL.indexOf('override onPointerUp'));
    expect(up).toContain('openEditing(this.editor, id)');
    expect(BOX_TOOL).toContain('editor.setEditingShape(id)');
    expect(BOX_TOOL).toContain("editor.setCurrentTool('select.editing_shape')");
  });

  it('풍선·텍스트 도구 둘 다 같은 상태를 쓴다', () => {
    expect(read(`${DIR}page-text-tool.tsx`)).toContain('boxToolStates(');
    expect(read(`${DIR}speech-bubble-tools.tsx`)).toContain('boxToolStates(');
  });
});
