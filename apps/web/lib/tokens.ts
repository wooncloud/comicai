'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  ApiPaths,
  MODEL_TOKEN_COST,
  type ModelId,
  type TokenBalanceDTO,
  type TokenLedgerEntryDTO,
  type TokenOrderDTO,
  type TokenOrderStatus,
} from '@comicai/types';
import { api } from './api';
import { qk } from './query-keys';

export const ORDER_STATUS_LABEL: Record<TokenOrderStatus, string> = {
  // 사용자에게 pending 은 "결제 대기" 가 아니다 — 우리가 입금을 확인하는 중이다.
  pending: '확인 중',
  paid: '지급 완료',
  canceled: '취소됨',
  failed: '실패',
};

/** 원 단위 정수를 그대로 찍는다. 나누거나 곱하지 않는다. */
export function formatKrw(amountKrw: number): string {
  return `${amountKrw.toLocaleString('ko-KR')}원`;
}

export function formatTokens(n: number): string {
  return n.toLocaleString('ko-KR');
}

export interface UseTokenBalanceOptions {
  refetchInterval?: number | false;
}

/**
 * 잔액.
 *
 * **`throwOnError` 를 켜지 않는다.** 이 훅은 에디터 헤더에서도 돌고, 잔액 조회가
 * 실패했다고 편집 화면이 오류 경계로 바뀌면 **작업 중이던 것을 잃는다.** 잔액은
 * 없어도 그림을 그릴 수 있지만 캔버스는 없으면 아무것도 못 한다.
 *
 * 전역 설정은 `staleTime: 30_000, refetchOnWindowFocus: false` 이다(`app/providers.tsx`).
 * 그러나 잔액은 외부(모바일 뱅킹 송금, 운영자 /admin 입금 확인 등)에서 수시로 변경될 수 있으므로,
 * 사용자가 외부 작업을 마치고 창으로 돌아왔을 때 즉시 동기화할 수 있도록 `refetchOnWindowFocus: 'always'`
 * 를 켠다. 충전 요청 대기 중인 상태에서는 `refetchInterval` 을 넘겨 주기적 조회를 수행할 수 있다.
 */
export function useTokenBalance(options?: UseTokenBalanceOptions) {
  return useQuery<TokenBalanceDTO>({
    queryKey: qk.tokenBalance(),
    queryFn: () => api<TokenBalanceDTO>(ApiPaths.myTokens),
    throwOnError: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: options?.refetchInterval,
  });
}

export interface UseBillingOrdersOptions {
  refetchInterval?: number | false;
}

/**
 * 내 충전 요청 주문 목록.
 *
 * 전역 `refetchOnWindowFocus: false` 를 덮어쓰고 `'always'` 로 둔다 — 사용자가 인터넷 뱅킹
 * 등에서 입금을 마친 뒤 탭으로 돌아왔을 때(포커스 복귀) 즉시 확인 상태를 갱신해야 한다.
 * 입금 대기(pending) 중인 주문이 있을 때 호출부에서 `refetchInterval`(예: 60초)을 넘겨
 * 탭을 켜 두고 기다리는 사용자에게도 변경사항이 자동 반영되도록 한다.
 */
export function useBillingOrders(options?: UseBillingOrdersOptions) {
  return useQuery<TokenOrderDTO[]>({
    queryKey: qk.billingOrders(),
    queryFn: () => api<TokenOrderDTO[]>(ApiPaths.billingOrders),
    throwOnError: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: options?.refetchInterval,
  });
}

export interface UseTokenHistoryOptions {
  refetchInterval?: number | false;
}

/**
 * 내 토큰 사용·적립 내역.
 *
 * 잔액·주문과 마찬가지로 포커스 복귀 시 즉시 동기화할 수 있도록
 * `refetchOnWindowFocus: 'always'` 로 둔다.
 */
export function useTokenHistory(limit = 30, options?: UseTokenHistoryOptions) {
  return useQuery<TokenLedgerEntryDTO[]>({
    queryKey: qk.tokenHistory(),
    queryFn: () => api<TokenLedgerEntryDTO[]>(`${ApiPaths.myTokenHistory}?limit=${limit}`),
    throwOnError: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * 렌더가 끝난 뒤 잔액·내역을 다시 읽는다.
 *
 * 낙관적으로 깎지 않는다. 실패·시간초과·취소는 **자동 환급**되므로 화면이 미리 깎아
 * 두면 되돌리는 코드를 또 써야 하고, 그 코드가 환급 규칙과 어긋나는 순간 숫자가
 * 영원히 틀어진다. 서버가 진실이다.
 */
export function useRefreshTokens() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.tokenBalance() });
    void queryClient.invalidateQueries({ queryKey: qk.tokenHistory() });
  }, [queryClient]);
}

/**
 * "몇 장 만들 수 있는가" 를 문장으로.
 *
 * `null` 은 "비용이 없어 제한 없음"(mock), `undefined` 는 "아직 못 읽음" 이다. 한 삼항으로
 * 뭉개면 한쪽이 `0장` 이나 `NaN장` 으로 새어 나간다 — 잔액 화면에서 0장은 "못 만든다" 는
 * 뜻이라 사실과 정반대가 된다.
 */
export function affordableText(n: number | null | undefined): string {
  if (n === undefined) return '—';
  return n === null ? '제한 없음' : `${formatTokens(n)}장`;
}

export interface Affordability {
  cost: number;
  /** 잔액이 모자라 지금은 시작할 수 없다. */
  short: boolean;
}

/**
 * 이 모델로 지금 한 장 만들 수 있는가.
 *
 * 잔액을 못 읽었을 때 `short` 로 접으면 **잔액 조회가 실패한 사용자의 버튼이 잠긴다.**
 * 그건 서버가 막을 일이지 화면이 추측으로 막을 일이 아니다.
 */
export function affordability(balance: TokenBalanceDTO | undefined, model: ModelId): Affordability {
  /*
   * 단가는 **서버가 준 것**을 쓴다. 전역 `MODEL_TOKEN_COST` 는 자기 키를 넣은 사용자를
   * 모르기 때문에, 그걸 그대로 읽으면 BYOK 사용자에게 "4토큰 필요 · 잔액 0" 을 보여
   * 준다 — 서버는 그 렌더를 공짜로 처리하는데.
   *
   * 잔액을 아직 못 읽었을 때만 전역 표로 떨어진다. 그때는 버튼도 잠그지 않으므로
   * (아래 `short: false`) 틀린 숫자로 막는 일은 없고, 비용 표시만 근사치가 된다.
   */
  if (!balance) return { cost: MODEL_TOKEN_COST[model], short: false };
  const cost = balance.costs[model];
  return { cost, short: cost > 0 && balance.balance < cost };
}
