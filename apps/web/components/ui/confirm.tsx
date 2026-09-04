'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  /** 되돌릴 수 없는 결과를 한 문장으로. 없으면 제목만 보인다. */
  body?: string;
  /** 확인 버튼 문구. 무엇이 일어나는지 그대로 적는다("삭제", "로그아웃"). */
  confirmLabel?: string;
  /** 파괴적 동작인가. 확인 버튼이 destructive 스타일이 된다. */
  destructive?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * 확인 다이얼로그. 브라우저 `confirm()` 을 대신한다.
 *
 * 예전에는 호출부 9곳이 각자 `confirm('…')` 을 썼고, 그 결과 **같은 동작의 문구가
 * 이미 갈렸다** — 프로젝트 삭제가 한 곳에서는 "페이지도 함께 사라집니다" 를 경고하고
 * 다른 곳에서는 안 했다. 그리고 파괴적 동작인데 `destructive` 버튼 스타일을 쓸 수
 * 없었고, 모바일에서 버튼 간격을 잡아 둔 `ui/dialog` 의 규칙도 못 썼다.
 *
 * 호출부는 한 줄로 남는다:
 *
 *     if (!(await confirm({ title: '…', destructive: true }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // 다이얼로그 버튼이 나중에 부를 resolve. 열려 있는 동안만 산다.
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(ok: boolean) {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  }

  const value = useMemo(() => ask, [ask]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={options !== null}
        // 배경 클릭·Esc 로 닫으면 "취소" 다. 여기서 resolve 하지 않으면 호출부의
        // await 가 영원히 걸린다.
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.body && <DialogDescription>{options.body}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              취소
            </Button>
            <Button
              variant={options?.destructive ? 'destructive' : 'default'}
              onClick={() => settle(true)}
              autoFocus
            >
              {options?.confirmLabel ?? '확인'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm 은 ConfirmProvider 안에서만 쓸 수 있습니다.');
  return ask;
}
