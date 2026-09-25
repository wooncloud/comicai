import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const SHAPE = read('components/editor/tldraw/page-text-shape.tsx');
const EDITABLE = read('components/editor/tldraw/editable-text.tsx');

/**
 * 편집이 시작되면 캐럿이 실제로 그 상자에 들어가야 한다.
 *
 * 2026-09-25: tldraw 가 편집 상태만 바꾸고 포커스는 아무도 주지 않아서,
 * 더블클릭으로 편집을 열어도 글자가 안 쳐졌다. 상자를 한 번 더 클릭해야
 * 한다는 걸 사용자가 알아내야 했고, 빈 텍스트 상자만 남기기 쉬웠다.
 */
describe('page-text 편집 진입', () => {
  it('자유 텍스트도 말풍선과 같은 편집 칸을 쓴다', () => {
    expect(SHAPE).toContain('<EditableText');
    // 캔버스와 export 가 같은 자리·폭에서 끊는다.
    expect(SHAPE).toContain('box={pageTextBox(w, h)}');
  });

  it('편집 칸이 붙을 때 포커스를 주고 캐럿을 끝에 둔다', () => {
    const mount = EDITABLE.slice(EDITABLE.indexOf('const mountEditor'));
    expect(mount).toContain('el.focus()');
    expect(mount).toContain('range.collapse(false)');
  });

  it('보여 주는 칸과 편집 칸이 다른 요소다 — 한 요소를 React 와 나눠 쥐지 않는다', () => {
    // 밖에서 온 값으로 textContent 를 덮어쓰는 이펙트가 React 가 그린 줄을 지웠다.
    expect(EDITABLE).not.toContain('useLayoutEffect');
    expect(EDITABLE).toContain('if (!isEditing) {');
  });

  it('세로도 가운데 — 말풍선 안에서 중앙에 오도록', () => {
    expect(EDITABLE).toContain("justifyContent: 'center'");
  });
});
