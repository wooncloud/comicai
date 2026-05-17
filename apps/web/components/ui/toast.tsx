'use client';
import { useEffect } from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

type ToastKind = 'info' | 'success' | 'error';

/**
 * 앱 전역에 마운트하는 토스트 컨테이너. shadcn/sonner 기반.
 * 기존 `ToastProvider` 자리를 그대로 대체한다.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SonnerToaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: 'border-border bg-card text-foreground',
          },
        }}
      />
    </>
  );
}

/**
 * 기존 호출부와의 호환을 위해 동일한 시그니처를 유지한다.
 * - push('success' | 'error' | 'info', message)
 */
export function useToast() {
  return {
    push: (kind: ToastKind, message: string) => {
      if (kind === 'success') sonnerToast.success(message);
      else if (kind === 'error') sonnerToast.error(message);
      else sonnerToast(message);
    },
  };
}

export function useEffectToastOnError(err: unknown) {
  useEffect(() => {
    if (err) sonnerToast.error(String((err as Error)?.message ?? err));
  }, [err]);
}
