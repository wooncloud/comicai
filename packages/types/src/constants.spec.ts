import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  ENTITY_TYPES,
  IN_PROGRESS_RENDER_STATUSES,
  MODEL_IDS,
  MODEL_LABEL,
  MODEL_PROVIDER,
  MODEL_TOKEN_COST,
  SELECTABLE_MODEL_IDS,
  resolveModelId,
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

/**
 * 모델 id 는 `projects.default_model` 과 `render_jobs.model` 에 **문자열로 저장된다.**
 * 새 판으로 갈아탈 때 옛 id 를 목록에서 빼면 이미 저장된 행이 검증에 걸리고,
 * 지난 생성 기록의 라벨·단가가 undefined 가 된다. 아래가 그걸 막는다.
 */
describe('모델 판 올리기', () => {
  it('고를 수 있는 모델은 전체 목록 안에 있다', () => {
    for (const id of SELECTABLE_MODEL_IDS) {
      expect(MODEL_IDS).toContain(id);
    }
  });

  it('기본 모델은 고를 수 있는 모델이다', () => {
    expect(SELECTABLE_MODEL_IDS).toContain(DEFAULT_MODEL_ID);
  });

  it('mock 과 옛 판은 고르지 못한다', () => {
    expect(SELECTABLE_MODEL_IDS).not.toContain('mock');
    expect(SELECTABLE_MODEL_IDS).not.toContain('gpt-image-2');
    expect(SELECTABLE_MODEL_IDS).not.toContain('gemini-3.1-flash-image-preview');
  });

  it('라벨과 단가가 모든 모델을 덮는다 — 옛 기록도 읽을 수 있어야 한다', () => {
    expect(Object.keys(MODEL_LABEL).sort()).toEqual([...MODEL_IDS].sort());
    expect(Object.keys(MODEL_TOKEN_COST).sort()).toEqual([...MODEL_IDS].sort());
  });

  it('옛 id 는 같은 제공자의 지금 판으로 올라간다', () => {
    for (const id of MODEL_IDS) {
      const now = resolveModelId(id);
      // 올라간 곳은 고를 수 있는 모델이거나(사용자용) 자기 자신이다(mock).
      expect(MODEL_IDS).toContain(now);
      expect(MODEL_PROVIDER[now]).toBe(MODEL_PROVIDER[id]);
      // 올린 결과가 또 옛 판이면 안 된다 — 한 번에 지금 판까지 가야 한다.
      expect(resolveModelId(now)).toBe(now);
    }
    expect(resolveModelId('gpt-image-2')).toBe('gpt-image-2.5-flare');
    expect(resolveModelId('gemini-3.1-flash-image-preview')).toBe('gemini-3.1-flash-image');
  });

  it('지금 고를 수 있는 모델은 더 올라가지 않는다', () => {
    for (const id of SELECTABLE_MODEL_IDS) {
      expect(resolveModelId(id)).toBe(id);
    }
  });
});
