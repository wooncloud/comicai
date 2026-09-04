'use client';
import { useEffect, useRef } from 'react';

/**
 * value 변화 후 delay ms 동안 추가 변화가 없으면 cb 호출.
 *
 * **대기 중인 값은 언마운트될 때 그냥 보낸다.** 예전에는 정리 함수가 `clearTimeout`
 * 만 해서, 장면 설명을 다 쓰자마자 캔버스 빈 곳을 클릭해 선택을 풀면(= 인스펙터
 * 언마운트) PATCH 가 한 번도 나가지 않고 글이 사라졌다. 다른 컷을 클릭해도 `key`
 * 때문에 리마운트되어 마찬가지였다.
 *
 * 이탈 전송은 **마운트 전용 이펙트의 정리**에서 한다. 디바운스 이펙트의 정리에
 * 두면 값이 바뀔 때마다 그 정리가 돌아서 타이핑 한 글자마다 전송된다 — 디바운스의
 * 정반대다.
 *
 * 호출부의 cb 는 그 시점에 컴포넌트가 이미 사라졌을 수 있다는 것을 전제해야 한다.
 */
export function useDebounced<T>(value: T, delay: number, cb: (v: T) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const first = useRef(true);
  /** 아직 보내지 않은 값. 보낸 뒤에는 null 이라 이탈 시 중복 전송되지 않는다. */
  const pending = useRef<{ value: T } | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pending.current = { value };
    const t = setTimeout(() => {
      pending.current = null;
      cbRef.current(value);
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  useEffect(
    () => () => {
      if (pending.current) cbRef.current(pending.current.value);
    },
    [],
  );
}
