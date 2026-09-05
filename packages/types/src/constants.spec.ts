import { describe, expect, it } from 'vitest';
import {
  ENTITY_TYPES,
  IN_PROGRESS_RENDER_STATUSES,
  MODEL_IDS,
  MODEL_PROVIDER,
  RENDER_STATUSES,
  TERMINAL_RENDER_STATUSES,
  isInProgressRender,
} from './index';

/**
 * 값 목록이 두 곳에 있으면 조용히 갈라진다 — 폰트 목록이 실제로 그랬다(소비자 3개,
 * Zod 검증기 5개, 컴파일 에러 없음). 그래서 값은 `schemas.ts` 에만 두고 `index.ts` 는
 * 타입만 파생시킨다. 여기서는 **파생 관계가 실제로 유지되는지**를 고정한다.
 *
 * `satisfies` 가 "부분집합인가" 는 잡아 주지만 "빠짐없이 덮는가" 는 잡지 못한다.
 */
describe('파생 상수', () => {
  it('진행 중 + 종결 = 전체 렌더 상태 (하나 늘렸을 때 어느 쪽에도 안 넣으면 잡힌다)', () => {
    expect([...IN_PROGRESS_RENDER_STATUSES, ...TERMINAL_RENDER_STATUSES].sort()).toEqual(
      [...RENDER_STATUSES].sort(),
    );
  });

  it('두 목록은 겹치지 않는다', () => {
    const overlap = IN_PROGRESS_RENDER_STATUSES.filter((s) =>
      (TERMINAL_RENDER_STATUSES as readonly string[]).includes(s),
    );
    expect(overlap).toEqual([]);
  });

  it('isInProgressRender 는 그 목록을 그대로 쓴다', () => {
    for (const s of RENDER_STATUSES) {
      expect(isInProgressRender(s)).toBe(
        (IN_PROGRESS_RENDER_STATUSES as readonly string[]).includes(s),
      );
    }
    expect(isInProgressRender(null)).toBe(false);
    expect(isInProgressRender(undefined)).toBe(false);
  });

  it('MODEL_PROVIDER 는 모든 모델을 덮는다', () => {
    expect(Object.keys(MODEL_PROVIDER).sort()).toEqual([...MODEL_IDS].sort());
  });

  it('엔티티 타입에 style 이 있다 — 생성 거부 분기의 전제', () => {
    expect(ENTITY_TYPES).toContain('style');
  });
});
