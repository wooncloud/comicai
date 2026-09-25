'use client';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import { formatTokens, useTokenBalance } from '@/lib/tokens';
import { cn } from '@/lib/cn';

/**
 * 상단바의 잔액 — 아바타 바로 옆, 모든 화면에서.
 *
 * 예전에는 에디터 헤더에만 있었다. 그런데 "지금 몇 개 남았지" 는 대시보드에서
 * 작업을 고를 때도, 충전을 마치고 돌아왔을 때도 궁금하다. 그걸 보려고 설정 →
 * 토큰까지 들어가야 했다.
 *
 * 폭에 상관없이 보인다. 좁은 화면에서는 아바타가 드로어로 접히는데, 잔액은
 * 숫자 몇 글자라 자리를 다투지 않는다.
 *
 * 못 읽었으면 **아무것도 그리지 않는다.** 여기에 '—' 나 오류 문구를 띄우면 모든
 * 화면에 손댈 수 없는 경고가 상주하게 된다. 잔액을 몰라도 할 일은 다 할 수 있고,
 * 정말 모자라면 생성 버튼이 그 자리에서 말해 준다.
 */
export function TokenBalance() {
  const { data } = useTokenBalance();
  if (!data) return null;

  const empty = data.balance <= 0;
  return (
    <Link
      href="/settings/billing"
      title="토큰 잔액 · 충전"
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-2 py-1 text-caption tabular-nums transition-colors hover:bg-muted touch:min-h-11',
        empty ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Coins className="h-3.5 w-3.5" aria-hidden />
      <span>{formatTokens(data.balance)}</span>
      <span className="sr-only">토큰 남음</span>
    </Link>
  );
}
