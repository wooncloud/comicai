'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PanelWidthSpec {
  /** 처음 열릴 때, 그리고 숨겨진 것을 다시 끌어낼 때의 폭. */
  defaultWidth: number;
  min: number;
  max: number;
  /**
   * 이 폭보다 좁게 끌면 **숨긴다**(폭 0).
   *
   * `min` 과 따로 두는 이유: `min` 은 "이보다 좁으면 내용이 깨진다" 이고, 이 값은
   * "이쯤이면 접으려는 뜻이다" 다. 둘을 같은 값으로 묶으면 좁히다가 실수로 사라지거나,
   * 반대로 아무리 끌어도 안 접힌다.
   */
  hideBelow: number;
}

/**
 * 에디터 사이드 패널의 폭.
 *
 * **접기 버튼을 없앤 자리**다. 예전에는 패널마다 접기 버튼과, 접혔을 때 펼치는 레일이
 * 따로 있었다. 버튼은 늘 화면에 있으면서 정작 하는 일은 0/100 둘 중 하나였다 —
 * "조금만 좁히고 싶다" 는 할 수 없었고, 버튼 자체가 좁은 헤더의 자리를 먹었다.
 *
 * 이제 경계를 끌어 폭을 정하고, 너무 좁게 끌면 접힌다. 접힌 뒤에는 그 자리에 남은
 * 얇은 띠를 다시 끌어내면 된다.
 *
 * 폭은 브라우저에 남긴다. 작업하다 맞춰 둔 폭이 새로고침마다 되돌아가면 매번 다시
 * 맞춰야 한다.
 */
export function usePanelWidth(storageKey: string, spec: PanelWidthSpec) {
  /*
   * **첫 렌더는 항상 기본값이다.** localStorage 를 `useState` 초기화 함수에서 읽으면
   * 서버가 그린 HTML(기본 폭)과 값이 달라지는데, React 는 하이드레이션 때 어긋난
   * **속성을 고치지 않는다** — `style="width:144px"` 가 그대로 남아, 저장된 폭이
   * 조용히 무시된다(2026-09-25 에 실제로 그랬다. 저장은 되는데 새로고침하면 돌아왔다).
   *
   * 그래서 붙은 뒤에 읽어 적용한다. 한 프레임 동안 기본 폭이 보이지만, 값이 틀린
   * 채로 남는 것보다는 낫다.
   */
  const [width, setWidth] = useState(spec.defaultWidth);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    const n = raw == null ? NaN : Number(raw);
    if (Number.isFinite(n)) {
      // 0 은 '숨김'. 그 밖의 값은 지금 한계 안으로 넣는다 — 한계를 좁히는 배포가
      // 나가도 예전에 저장된 폭 때문에 패널이 화면을 다 먹는 일이 없다.
      setWidth(n <= 0 ? 0 : Math.max(spec.min, Math.min(spec.max, n)));
    }
    setLoaded(true);
    /*
     * 의존성의 한계값은 호출부에 박힌 상수라 실제로는 붙을 때 한 번만 돈다.
     * 이게 다시 돌면 사용자가 방금 끌어 맞춘 폭이 저장된 값으로 되돌아가므로,
     * 여기에 자주 바뀌는 값을 넣지 말 것.
     */
  }, [storageKey, spec.min, spec.max]);

  useEffect(() => {
    // 읽기 전에 쓰면 저장된 값을 기본값으로 덮어쓴다.
    if (!loaded) return;
    // 끄는 동안에는 폭이 포인터 속도로 바뀐다. 멈춘 뒤 한 번만 남긴다 — localStorage 는
    // 동기라, 매번 쓰면 끄는 내내 메인 스레드에서 디스크 쓰기가 돈다.
    const t = window.setTimeout(() => window.localStorage.setItem(storageKey, String(width)), 300);
    return () => window.clearTimeout(t);
  }, [storageKey, width, loaded]);

  /** 끄는 동안의 폭. 지정된 한계와 숨김 문턱을 여기서 적용한다. */
  const resize = useCallback(
    (raw: number) => {
      setWidth(raw < spec.hideBelow ? 0 : Math.max(spec.min, Math.min(spec.max, raw)));
    },
    [spec.hideBelow, spec.min, spec.max],
  );

  return { width, hidden: width === 0, resize, spec };
}

/**
 * 경계를 끄는 동작.
 *
 * 포인터 캡처를 쓴다 — 캡처가 없으면 빨리 끌 때 포인터가 손잡이를 벗어나면서
 * 이벤트가 끊기고, 손을 뗀 줄 모른 채 멈춘다.
 */
export function useResizeDrag(
  side: 'left' | 'right',
  current: number,
  fallback: number,
  onResize: (w: number) => void,
) {
  const start = useRef({ x: 0, w: 0 });
  const [dragging, setDragging] = useState(false);

  return {
    dragging,
    handlers: {
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // 접혀 있으면 기본 폭에서 시작한다 — 0 에서 시작하면 끌어내도 문턱을 못 넘는다.
        start.current = { x: e.clientX, w: current || fallback };
        setDragging(true);
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (!dragging) return;
        const dx = side === 'left' ? e.clientX - start.current.x : start.current.x - e.clientX;
        onResize(start.current.w + dx);
      },
      onPointerUp(e: React.PointerEvent<HTMLElement>) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setDragging(false);
      },
    },
  };
}
