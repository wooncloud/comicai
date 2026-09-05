'use client';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import { formatTokens, useTokenBalance } from '@/lib/tokens';

/**
 * 에디터 헤더의 잔액.
 *
 * 인스펙터가 아니라 헤더에 두는 이유: (1) 아무 컷도 고르지 않은 상태에서도 보여야 하고,
 * (2) "만들까 말까" 를 정하는 시점은 컷을 고르기 **전**이며, (3) 사용자는 이미 저장
 * 상태를 보러 이 자리를 본다.
 *
 * 못 읽었으면 **아무것도 그리지 않는다.** 여기에 '—' 나 오류 문구를 띄우면 그림을
 * 그리는 화면에 손댈 수 없는 경고가 상주하게 된다. 잔액을 몰라도 캔버스는 멀쩡히
 * 쓸 수 있고, 정말 모자라면 생성 버튼이 그 자리에서 말해 준다.
 */
export function TokenBalance() {
  const { data } = useTokenBalance();
  if (!data) return null;

  const empty = data.balance <= 0;
  return (
    <Link
      href="/settings/billing"
      title="토큰 잔액 · 충전"
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-caption tabular-nums transition-colors hover:bg-muted ${
        empty ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Coins className="h-3.5 w-3.5" aria-hidden />
      <span>{formatTokens(data.balance)}</span>
      <span className="sr-only">토큰 남음</span>
    </Link>
  );
}
