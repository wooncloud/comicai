'use client';
import { useEffect, useState } from 'react';

/**
 * useState + localStorage 직렬화. 키별 boolean 토글 (접힘/펼침 등) 용도.
 * 초기값은 lazy initializer로 1회만 읽는다(SSR 가드).
 */
export function useLocalStorageBoolean(key: string, defaultValue = false) {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const raw = window.localStorage.getItem(key);
    return raw == null ? defaultValue : raw === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value ? '1' : '0');
  }, [key, value]);
  return [value, setValue] as const;
}
