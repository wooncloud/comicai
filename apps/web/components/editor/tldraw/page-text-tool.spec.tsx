import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPageTextStyle, defaultSpeechBubbleStyle } from '@comicai/types';

/** vitest 는 apps/web 에서 돈다. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const TOOL = 'components/editor/tldraw/page-text-tool.tsx';
const BUBBLE = 'components/editor/tldraw/speech-bubble-tools.tsx';

/**
 * 도구가 만드는 도형의 기본 스타일은 `packages/types` 한 곳에서만 온다.
 *
 * 2026-09-25: 도구가 fontSize/색/정렬을 직접 박아 둬서, 공용 기본값을 가운데 정렬로
 * 바꿔도 **새로 만든 텍스트만 왼쪽 정렬로 태어났다.** 같은 페이지 안에서 대사 정렬이
 * 서로 달라진다. 값이 한 곳에만 있는지는 소스로만 지킬 수 있어 여기서 본다.
 */
describe('도구 기본 스타일은 packages/types 하나만 본다', () => {
  it('텍스트 도구가 스타일 값을 다시 적어 두지 않는다', () => {
    const src = read(TOOL);
    expect(src).toContain('...defaultPageTextStyle()');
    for (const hardcoded of ["textAlign: '", 'fontSize: 2', "fontFamily: '", "color: '#"]) {
      expect(src).not.toContain(hardcoded);
    }
  });

  it('말풍선 도구가 스타일 값을 다시 적어 두지 않는다', () => {
    const src = read(BUBBLE);
    expect(src).toContain('...defaultSpeechBubbleStyle()');
    for (const hardcoded of ["strokeColor: '#", "fillColor: '#", 'strokeWidth: 2']) {
      expect(src).not.toContain(hardcoded);
    }
  });

  it('공용 기본값 자체는 이 모양이다', () => {
    expect(defaultPageTextStyle().textAlign).toBe('center');
    expect(defaultSpeechBubbleStyle().fillColor).toBe('#ffffff');
  });
});

describe('텍스트는 만들자마자 칠 수 있다', () => {
  it('클릭 생성 직후 편집 모드로 들어간다', () => {
    const src = read(TOOL);
    expect(src).toContain('setEditingShape(id)');
    expect(src).toContain("setCurrentTool('select.editing_shape')");
  });
});
