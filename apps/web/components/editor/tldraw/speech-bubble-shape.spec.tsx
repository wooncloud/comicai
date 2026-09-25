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
    // 다각형은 꼭짓점까지 넘겨 안쪽을 직접 구한다.
    expect(BUBBLE).toContain('bubbleTextBox(variant, w, h, polygonPoints)');
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

  it('다각형 풍선도 다 찍고 나면 편집이 열린다 — 커밋이 동기라 다음 프레임에', () => {
    const src = read('components/editor/tldraw/speech-bubble-tools.tsx');
    const body = src.slice(src.indexOf('protected commitPolygon'));
    expect(body).toContain('openEditingNextFrame(this.editor, id)');
    expect(src).toContain('requestAnimationFrame(() => {');
  });
});

/**
 * 꼬리는 데이터와 렌더가 처음부터 있었는데 만들 방법이 없었다 — 항상 null 이라
 * 아무도 쓸 수 없었다. 2026-09-25 에 손잡이와 버튼을 붙였다.
 */
describe('말풍선 꼬리', () => {
  const INSPECTOR = read('components/editor/speech-bubble-inspector.tsx');

  it('손잡이 하나를 내준다 — 없으면 create, 있으면 vertex', () => {
    expect(BUBBLE).toContain('override getHandles');
    expect(BUBBLE).toContain("id: 'tail'");
    expect(BUBBLE).toContain("has ? 'vertex' : 'create'");
  });

  it('손잡이를 끌면 끝점이 바뀐다', () => {
    expect(BUBBLE).toContain('override onHandleDrag');
    expect(BUBBLE).toContain('tailX: handle.x, tailY: handle.y');
  });

  it('꼬리를 몸통보다 먼저 그린다 — 밑변이 풍선 안에서 보이면 안 된다', () => {
    const tail = BUBBLE.indexOf('d={tailPath}');
    const body = BUBBLE.indexOf('d={bodyPath}');
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThan(body);
  });

  it('인스펙터에서 달고 없앨 수 있다 — 손잡이만으로는 발견되지 않는다', () => {
    expect(INSPECTOR).toContain('꼬리 달기');
    expect(INSPECTOR).toContain('꼬리 없애기');
    expect(INSPECTOR).toContain('tailX: null, tailY: null');
  });
});
