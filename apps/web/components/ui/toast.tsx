'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastKind = 'info' | 'success' | 'error';
interface Toast { id: number; kind: ToastKind; message: string }

interface Ctx {
  push: (kind: ToastKind, message: string) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
                : t.kind === 'success'
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
                : 'border-neutral-200 bg-white text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Provider 미장착 환경(테스트 등)에선 콘솔 폴백
    return {
      push: (kind: ToastKind, message: string) => {
        // eslint-disable-next-line no-console
        console.log(`[toast:${kind}] ${message}`);
      },
    };
  }
  return ctx;
}

export function useEffectToastOnError(err: unknown) {
  const { push } = useToast();
  useEffect(() => {
    if (err) push('error', String((err as Error)?.message ?? err));
  }, [err, push]);
}
