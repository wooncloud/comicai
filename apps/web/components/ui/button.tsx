'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  // `[@media(pointer:coarse)]:min-h-11` — 손가락으로 누르는 기기에서만 최소 44px
  // (Apple HIG 권장 최소 터치 크기)를 보장한다. size 별 h-8/h-9/h-10 은 그대로 두고
  // min-height 로 덮으므로 마우스 환경의 밀도는 전혀 바뀌지 않는다.
  //
  // 브레이크포인트가 아니라 pointer 로 가른 이유는, 터치 여부는 화면 폭과 무관하기
  // 때문이다 — iPad 는 넓지만 여전히 손가락으로 누른다.
  //
  // 호출부 20여 곳의 size="sm" 을 각각 고치는 대신 여기 한 곳에 둔 것은, 새로
  // 추가되는 버튼까지 자동으로 적용되게 하기 위해서다.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [@media(pointer:coarse)]:min-h-11',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
