'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * 화면 가장자리에서 밀려 들어오는 패널. 모바일 내비게이션 드로어에 쓴다.
 *
 * Radix Dialog 위에 올렸다 — 포커스 트랩, Esc 닫기, 배경 스크롤 잠금, `aria-modal`
 * 이 전부 필요하고 그걸 다시 구현할 이유가 없다.
 *
 * `ui/dialog.tsx` 를 재사용하지 않은 이유는 위치 클래스가 아니라 애니메이션이다.
 * DialogContent 의 `zoom-in-95`/`zoom-out-95` 는 twMerge 충돌 그룹이 아니라
 * className 으로 지울 수 없어서, 슬라이드와 줌이 동시에 걸린다. 거기에 무조건
 * 렌더되는 닫기 X 와 `grid gap-4 p-6` 강제까지 겹친다.
 *
 * z-index 는 dialog.tsx 와 같은 토큰(`z-overlay`/`z-dialog`)을 쓴다 — 새 층을
 * 만들면 어느 것이 위인지가 다시 추측의 영역이 된다.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** 어느 가장자리에서 밀려 들어올지. 기본은 왼쪽(내비게이션 관례). */
    side?: 'left' | 'right';
  }
>(({ className, children, side = 'left', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-black/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 100dvh: iOS 주소창이 접혔다 펴져도 실제 보이는 높이를 따라간다.
        // 최대 폭을 뷰포트의 82% 로 제한해, 가장 좁은 화면에서도 뒤 배경이 보인다 —
        // 드로어가 화면을 통째로 덮으면 어디로 돌아가는지 감각이 사라진다.
        'fixed inset-y-0 z-dialog flex h-dvh w-72 max-w-[82%] flex-col border-border bg-background shadow-lg duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in',
        side === 'left'
          ? 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
          : 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="메뉴 닫기"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
