'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-overlay bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 폭·높이 상한은 뷰포트에서 2rem 을 뺀 값이다. 예전에는 `w-full` 이라 좁은
        // 화면에서 좌우가 가장자리에 딱 붙었고, 높이 상한이 아예 없어서 내용이 길면
        // 다이얼로그가 화면 위아래로 잘려 나갔다 — 잘린 자리에 확인/취소 버튼이
        // 있으면 아무것도 할 수 없었다. 100dvh 는 iOS 주소창이 접혔다 펴져도
        // 실제 보이는 높이를 따라간다(100vh 는 항상 최대 높이라 그만큼 잘린다).
        //
        // 닫기(X)는 이 스크롤 영역 안에 있어서 내용이 길면 같이 밀려 올라간다.
        // 오버레이 탭과 Esc 로도 닫히므로(Radix 기본) 그대로 두었다.
        'fixed left-1/2 top-1/2 z-dialog grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    >
      {children}
      {/*
        아이콘은 16px 그대로 두고 버튼만 44x44 로 넓힌다(Apple HIG 최소 터치 크기).
        예전에는 패딩이 없어 탭 영역이 아이콘 크기 그대로였고, 화면 모서리라
        손가락으로는 거의 못 눌렀다. right-1/top-1 인 이유는 44px 박스로 커진 만큼
        인셋을 줄여야 아이콘이 원래 자리에 남고, 포커스 링도 다이얼로그 밖으로
        삐져나오지 않기 때문이다.
      */}
      <DialogPrimitive.Close className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        <X className="h-4 w-4" />
        <span className="sr-only">닫기</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // 모바일에서는 세로로 쌓이는데 예전에 쓰던 가로 간격 유틸리티(space-x-*)는
      // 그때 적용되지 않아 버튼이 서로 맞붙었다. 확인 옆 취소를 잘못 누르기 쉬웠다.
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-title-md font-semibold', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-body-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
