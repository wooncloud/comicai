import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
  join(process.cwd(), 'components/editor/tldraw/page-text-shape.tsx'),
  'utf8',
);

/**
 * 편집이 시작되면 캐럿이 실제로 그 상자에 들어가야 한다.
 *
 * 2026-09-25: tldraw 가 편집 상태만 바꾸고 포커스는 아무도 주지 않아서,
 * 더블클릭으로 편집을 열어도 글자가 안 쳐졌다. 상자를 한 번 더 클릭해야
 * 한다는 걸 사용자가 알아내야 했고, 빈 텍스트 상자만 남기기 쉬웠다.
 */
describe('page-text 편집 진입', () => {
  it('isEditing 이 켜지면 포커스를 준다', () => {
    expect(SRC).toMatch(
      /useLayoutEffect\(\(\) => \{\s*if \(!isEditing\) return;[\s\S]*?\.focus\(\)/,
    );
  });

  it('캐럿을 끝에 둔다 — 고치려고 열었을 때 앞으로 튀지 않게', () => {
    expect(SRC).toContain('range.collapse(false)');
  });

  it('세로도 가운데 — 말풍선 안에서 중앙에 오도록', () => {
    expect(SRC).toContain("alignItems: 'center'");
    expect(SRC).not.toContain("alignItems: 'flex-start'");
  });
});
