import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const BUBBLE = read('components/editor/tldraw/speech-bubble-shape.tsx');

/**
 * 말풍선은 자기 대사를 갖는다 — 풍선을 옮기면 글자도 따라온다.
 * 2026-09-25 이전에는 PageText 를 따로 만들어 위에 얹어야 했다.
 */
describe('말풍선 대사', () => {
  it('풍선 도형이 대사와 글자 스타일을 props 로 갖는다', () => {
    for (const key of ['text: T.string', 'fontSize: T.number', 'textColor: T.string']) {
      expect(BUBBLE).toContain(key);
    }
  });

  it('더블클릭으로 편집할 수 있다', () => {
    expect(BUBBLE).toMatch(/canEdit\(\)\s*\{[^}]*return true/);
  });

  it('줄바꿈은 export 와 같은 wrapText 를 쓴다 — CSS 로 접지 않는다', () => {
    expect(BUBBLE).toContain('wrapText(text,');
    expect(BUBBLE).toContain('bubbleTextBox(variant, w, h)');
  });

  it('편집이 열리면 캐럿을 준다', () => {
    expect(BUBBLE).toContain('.focus()');
    expect(BUBBLE).toContain('range.collapse(false)');
  });
});

describe('드래그로 새로 그리면 바로 쓸 수 있다', () => {
  const TOOLS = [
    read('components/editor/tldraw/speech-bubble-tools.tsx'),
    read('components/editor/tldraw/page-text-tool.tsx'),
  ];

  it('풍선·텍스트 도구 둘 다 드래그 생성 뒤 편집을 연다', () => {
    for (const src of TOOLS) {
      expect(src).toContain('openEditingAfterDrag(this.editor, id)');
      expect(src).toContain("setCurrentTool('select.editing_shape')");
    }
  });

  it('pointerup 을 한 번만 듣고 스스로 떼어 낸다', () => {
    for (const src of TOOLS) {
      expect(src).toContain("window.addEventListener('pointerup', run, true)");
      expect(src).toContain("window.removeEventListener('pointerup', run, true)");
    }
  });

  it('드래그 도중 취소되어 도형이 없으면 아무것도 하지 않는다', () => {
    for (const src of TOOLS) expect(src).toContain('if (!editor.getShape(id)) return;');
  });
});
