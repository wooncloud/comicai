'use client';
import { useEffect, useRef } from 'react';

/** value 변화 후 delay ms 동안 추가 변화 없으면 cb 호출. */
export function useDebounced<T>(value: T, delay: number, cb: (v: T) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => cbRef.current(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
}
