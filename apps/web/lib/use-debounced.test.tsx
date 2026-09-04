import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDebounced } from './use-debounced';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebounced', () => {
  it('마지막 값 하나만 delay 뒤에 보낸다', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(({ v }) => useDebounced(v, 800, cb), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    rerender({ v: 'abc' });
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('abc');
  });

  it('첫 렌더의 초기값은 보내지 않는다', () => {
    const cb = vi.fn();
    renderHook(() => useDebounced('a', 800, cb));
    vi.advanceTimersByTime(800);
    expect(cb).not.toHaveBeenCalled();
  });

  /*
   * 이 두 개가 이 훅의 존재 이유다.
   *
   * 장면 설명을 다 쓰자마자 선택을 풀면 인스펙터가 언마운트되는데, 예전에는
   * clearTimeout 만 해서 PATCH 가 한 번도 나가지 않고 글이 사라졌다.
   */
  it('대기 중인 값이 있으면 언마운트할 때 보낸다', () => {
    const cb = vi.fn();
    const { rerender, unmount } = renderHook(({ v }) => useDebounced(v, 800, cb), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    vi.advanceTimersByTime(100); // 아직 디바운스 중
    unmount();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('ab');
  });

  /*
   * 이탈 전송을 디바운스 이펙트의 정리에 두면 값이 바뀔 때마다 그 정리가 돌아서
   * 타이핑 한 글자마다 전송된다 — 디바운스의 정반대다. 그래서 마운트 전용
   * 이펙트에 둔다. 이 테스트가 그 경계를 고정한다.
   */
  it('값이 바뀌는 것만으로는 보내지 않는다', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(({ v }) => useDebounced(v, 800, cb), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    rerender({ v: 'abc' });
    rerender({ v: 'abcd' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('이미 보낸 값은 언마운트에서 다시 보내지 않는다', () => {
    const cb = vi.fn();
    const { rerender, unmount } = renderHook(({ v }) => useDebounced(v, 800, cb), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    vi.advanceTimersByTime(800);
    expect(cb).toHaveBeenCalledTimes(1);

    unmount();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
